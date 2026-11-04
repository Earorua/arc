import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";
import { build } from "esbuild";
import { assertNoLinks, inside, portable, readRegularFile } from "./restricted-candidate-files.mjs";
import { materialWorkerBuildOptions } from "./package-materials-workers.mjs";

const run = promisify(execFile);
const sha256 = value => createHash("sha256").update(value).digest("hex");
function check(value) { if(!value) throw new Error("Frozen materials source mismatch"); }
function gitBlobHash(bytes) {
  return createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
}
function bundlePrerequisite(bundle, declaredBase, candidate) {
  const headerEnd = bundle.indexOf("\n\n");
  check(headerEnd > 0 && headerEnd < 65536 && bundle.subarray(headerEnd + 2,headerEnd + 6).toString() === "PACK");
  const lines = bundle.subarray(0,headerEnd).toString("utf8").split("\n");
  check(["# v2 git bundle","# v3 git bundle"].includes(lines[0]));
  check(lines.every(line => !line.startsWith("@") || line === "@object-format=sha1"));
  const prerequisites = lines.filter(line => line.startsWith("-"));
  if (!prerequisites.length) return null;
  const base = /^-([a-f0-9]{40})(?: .*|)$/u.exec(prerequisites[0])?.[1];
  check(prerequisites.length === 1 && base && base === declaredBase && base !== candidate);
  return base;
}
/** Bind the supplied bundle, actual commit tree, packaged SQL and compiled paid worker to the reviewed source. */
export async function verifyMaterialsFrozenSource(root, bundle, requested, artifacts, active, declaredBase) {
  const repo = resolve(root);
  const base = bundlePrerequisite(bundle,declaredBase,requested.candidate);
  const scratch=await mkdtemp(join(tmpdir(),"arc-materials-git-"));
  try {
    // No user Git configuration, templates, object alternates or network protocols can supplement this restore.
    const env = {PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:tmpdir(),TMP:tmpdir(),
      HOME:scratch,USERPROFILE:scratch,GIT_CONFIG_GLOBAL:join(scratch,"isolated.gitconfig"),GIT_CONFIG_NOSYSTEM:"1",
      GIT_NO_LAZY_FETCH:"1",GIT_TERMINAL_PROMPT:"0",GIT_ALLOW_PROTOCOL:"file"};
    async function git(args) {
      const result=await run("git",["--no-lazy-fetch","--no-replace-objects","--git-dir",scratch,...args],
        {encoding:"buffer",maxBuffer:20*1024*1024,windowsHide:true,env});
      return result.stdout;
    }
    await git(["init","--bare","--quiet","--template="]);
    if (base) {
      await git(["fetch","--quiet","--no-tags","--no-write-fetch-head","--recurse-submodules=no","--no-auto-maintenance",
        "--depth=1",pathToFileURL(repo).href,base+":refs/heads/reviewed-base"]);
      // Require exactly the base commit and its snapshot. A source checkout can also contain the candidate.
      const seeded = (await git(["cat-file","--batch-check=%(objectname)","--batch-all-objects"])).toString().trim().split("\n").sort();
      const reachable = (await git(["rev-list","--objects","--no-object-names",base])).toString().trim().split("\n").sort();
      check(isDeepStrictEqual(seeded,reachable) && !seeded.includes(requested.candidate));
    }
    const bundlePath = join(scratch,"reviewed.bundle");
    await writeFile(bundlePath,bundle,{flag:"wx"});
    await git(["bundle","verify",bundlePath]);
    const heads=(await git(["bundle","unbundle",bundlePath])).toString().trim().split("\n");
    check(heads.length===1 && heads[0].split(" ")[0]===requested.candidate);
    check((await git(["cat-file","-t",requested.candidate])).toString().trim()==="commit");
    await git(["fsck","--strict","--full","--no-reflogs","--no-dangling",requested.candidate]);
    check((await git(["rev-parse","--verify",requested.candidate+"^{tree}"])).toString().trim()===requested.tree);
    if(base) await git(["merge-base","--is-ancestor",base,requested.candidate]);
    await matchGitFiles(repo,requested,artifacts,active,git);
  } finally {
    check(dirname(resolve(scratch))===resolve(tmpdir()) && basename(scratch).startsWith("arc-materials-git-"));
    await assertNoLinks(scratch); await rm(scratch,{recursive:true,force:true});
  }
}
async function verifyExecutingPackager(entries) {
  // Node loads these modules relative to this script, even if the supplied candidate is in another checkout.
  const executingRoot = fileURLToPath(new URL("../../",import.meta.url));
  const graph = await build({absWorkingDir:executingRoot,entryPoints:["scripts/prepare-materials-production-package.mjs"],
    bundle:true,format:"esm",platform:"node",packages:"external",metafile:true,write:false,logLevel:"silent"});
  for (const path of [...Object.keys(graph.metafile.inputs),"package.json","package-lock.json","tsconfig.json"]) {
    const actual = resolve(executingRoot,path);
    check(inside(executingRoot,actual) && entries.has(path));
    check(gitBlobHash(await readRegularFile(actual)) === entries.get(path));
  }
}
async function matchGitFiles(repo, requested, artifacts, active, git) {
  const entries=new Map();
  for(const row of (await git(["ls-tree","-r","-z",requested.candidate])).toString().split("\0").filter(Boolean)) {
    const tab=row.indexOf("\t"), [mode,type,id]=row.slice(0,tab).split(" ");
    if(type==="blob" && (mode==="100644" || mode==="100755")) entries.set(row.slice(tab+1),id);
  }
  async function sourceBytes(path) {
    const blob=entries.get(path);
    check(blob && inside(repo,join(repo,path)));
    const actual=join(repo,path);
    await assertNoLinks(actual,true);
    try {
      const bytes=await readFile(actual);
      if(gitBlobHash(bytes)===blob) return bytes;
    } catch(error) { if(error.code !== "ENOENT") throw error; }
    check(!active);
    return git(["cat-file","blob",blob]);
  }
  for(const config of ["package.json","package-lock.json","tsconfig.json"]) {
    if(entries.has(config)) check(gitBlobHash(await readFile(join(repo,config)))===entries.get(config));
  }
  if(active) {
    await verifyExecutingPackager(entries);
    check(entries.has("worker/document-executor/production-policy.ts"));
    check(entries.has("worker/document-executor/migrations/0003_document_production.sql"));
  }
  const expectedMigrations=[];
  for(const [directory, destination] of [["drizzle/","site/server/drizzle/"],["worker/document-executor/migrations/","executor/migrations/"]]) {
    for(const path of entries.keys()) {
      if(path.startsWith(directory) && /^\d+_[^/]+\.sql$/u.test(path.slice(directory.length))) {
        expectedMigrations.push({path:destination+basename(path),sha256:sha256(await sourceBytes(path))});
      }
    }
  }
  const ordered=(a,b)=>a.path<b.path?-1:a.path>b.path?1:0;
  check(isDeepStrictEqual(expectedMigrations.sort(ordered),artifacts.filter(file=>file.path.startsWith("site/server/drizzle/") || file.path.startsWith("executor/migrations/"))));
  const loaders={".ts":"ts",".tsx":"tsx",".js":"js",".mjs":"js",".json":"json"};
  const compiled=await build({...materialWorkerBuildOptions,absWorkingDir:repo,entryPoints:["worker/document-executor/index.ts"],outfile:"executor/index.mjs",
    write:false,logLevel:"silent",plugins:[{name:"frozen-materials-source",setup(builder){
      builder.onLoad({filter:/.*/},async args=>{
        if(inside(join(repo,"node_modules"),args.path)) return;
        const path=portable(relative(repo,args.path)),loader=loaders[extname(path)];
        check(loader && inside(repo,args.path));
        return {contents:await sourceBytes(path),loader,resolveDir:dirname(args.path)};
      });
    }}]});
  const executor=artifacts.find(file=>file.path==="executor/index.mjs");
  check(executor && compiled.outputFiles.length===1 && sha256(compiled.outputFiles[0].contents)===executor.sha256);
}
