// Local packaging only. node --import tsx scripts/prepare-materials-production-package.mjs <reviewed-packet.json> <new-name>
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { build } from "esbuild";
import { z } from "zod";
import { assertNoLinks, inside, readRegularFile as bytes, safeRelative } from "./lib/restricted-candidate-files.mjs";
import { composeProductionConfigs, readPacketJson, sha256, verifyProductionBaseline } from "./lib/materials-production-package.mjs";
import { verifyMaterialsFrozenSource } from "./lib/verify-materials-frozen-source.mjs";

const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const filePath = z.string().min(1).max(2048);
const revision = z.string().regex(/^[0-9a-f]{40}$/u);
const schema = z.strictObject({
  schemaVersion:z.literal(1),
  baseline:z.strictObject({ configFile:filePath, versionFile:filePath, deploymentsFile:filePath, accountId:z.string(),
    workerName:z.string(), versionId:z.uuid(), deploymentId:z.uuid(), configSha256:digest }),
  source:z.strictObject({ candidateDirectory:filePath, candidate:revision, tree:revision, bundleSha256:digest, verificationSha256:digest, artifactTreeSha256:digest }),
  resources:z.unknown(), activation:z.unknown(),
});
const order = (a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
function check(value) { if (!value) throw new Error("Invalid public materials package input"); }
async function json(path) { return readPacketJson(await bytes(path)); }
async function captureFiles(root, relative = "") {
  const rows = [];
  for (const item of await readdir(join(root,relative), {withFileTypes:true})) {
    const path = relative ? relative + "/" + item.name : item.name;
    safeRelative(path);
    if (item.isDirectory()) rows.push(...await captureFiles(root,path));
    else {
      check(item.isFile());
      rows.push({path,sha256:sha256(await bytes(join(root,path)))});
    }
  }
  return rows.sort(order);
}
async function frozenInput(root, requested, active) {
  safeRelative(requested.candidateDirectory);
  const records = resolve(root,requested.candidateDirectory);
  check(inside(join(root,"docs/verification"),records));
  const [candidate,verifiedBytes,index,bundle] = await Promise.all([json(join(records,"candidate.json")),bytes(join(records,"verification.json")),
    json(join(records,"artifact-index.json")),bytes(join(records,"source.bundle"))]);
  check(sha256(verifiedBytes)===requested.verificationSha256);
  const verified=readPacketJson(verifiedBytes);
  check(candidate.candidate === requested.candidate && candidate.tree === verified.tree && candidate.tree===requested.tree);
  check(verified.candidate === candidate.candidate && sha256(bundle) === requested.bundleSha256 && candidate.bundleSha256 === requested.bundleSha256
    && verified.bundleSha256 === requested.bundleSha256);
  check(verified.artifacts.mode === "closed" && verified.artifacts.verifiedAgainstDisk === true && index.mode === "closed");
  check(index.treeSha256 === requested.artifactTreeSha256 && index.treeSha256 === verified.artifacts.treeSha256
    && index.treeSha256 === sha256(JSON.stringify(index.artifacts)) && verified.artifacts.files === index.artifacts.length);
  safeRelative(index.relativeDirectory);
  const directory=resolve(root,index.relativeDirectory);
  check(inside(join(root,"outputs/materials-gate-1b-b0"),directory));
  await assertNoLinks(directory);
  check(isDeepStrictEqual(await captureFiles(directory),index.artifacts));
  check(index.artifacts.every(item=>item.path.startsWith("site/") || item.path.startsWith("executor/")));
  const names=new Set(index.artifacts.map(item=>item.path));
  for(const file of ["site/server/index.js","site/server/wrangler.json","executor/index.mjs","executor/wrangler.json"]) check(names.has(file));
  check(index.artifacts.some(item=>item.path.startsWith("site/client/")) && index.artifacts.some(item=>/^site\/server\/drizzle\/\d+_.+\.sql$/u.test(item.path)));
  const [compiledSite,compiledExecutor]=await Promise.all([json(join(directory,"site/server/wrangler.json")),json(join(directory,"executor/wrangler.json"))]);
  for(const config of [compiledSite,compiledExecutor]) {
    check(config.vars?.ARC_DOCUMENT_ACCEPTANCE_MODE==="closed" && config.vars?.ARC_DOCUMENTS_ENABLED==="false" && config.d1_databases?.length>0);
  }
  check(compiledSite.main==="index.js" && compiledSite.assets?.binding==="ASSETS" && compiledSite.assets.directory==="../client");
  check(compiledSite.no_bundle===true && isDeepStrictEqual(compiledSite.rules,[{type:"ESModule",globs:["**/*.js","**/*.mjs"]}]));
  check(compiledExecutor.main==="./index.mjs" && compiledExecutor.workers_dev===false && compiledExecutor.preview_urls===false && compiledExecutor.routes?.length===0);
  await verifyMaterialsFrozenSource(root,bundle,requested,index.artifacts,active,candidate.base);
  return {candidate,index,directory,names,compiledSite,compiledExecutor};
}
async function verifyEntrypoints(source, expected) {
  const parsed=await build({stdin:{contents:source.toString(),sourcefile:"worker.mjs"},format:"esm",target:"es2022",
    write:false,bundle:false,metafile:true,logLevel:"silent"});
  check(expected.every(name=>Object.values(parsed.metafile.outputs)[0].exports.includes(name)));
}
async function exists(path) {
  try { await lstat(path); return true; } catch(error) { if(error.code === "ENOENT") return false; throw error; }
}
export async function prepareMaterialsProductionPackage(root, packetPath, outputName, now = Date.now) {
  check(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(outputName) && outputName.length <= 64);
  const packet=schema.parse(await json(packetPath));
  const { configFile,versionFile,deploymentsFile,...expected }=packet.baseline;
  const relativeFile=path=>resolve(dirname(packetPath),path);
  const [configBytes,version,deployments,frozen]=await Promise.all([bytes(relativeFile(configFile)),json(relativeFile(versionFile)),json(relativeFile(deploymentsFile)),
    frozenInput(root,packet.source,packet.activation?.mode==="production")]);
  const baseline=verifyProductionBaseline({configBytes,version,deployments,expected});
  const pair=await composeProductionConfigs(baseline.config,packet.resources,packet.activation,now);
  check(pair.site.compatibility_date===frozen.compiledSite.compatibility_date && isDeepStrictEqual(pair.site.compatibility_flags,frozen.compiledSite.compatibility_flags));
  const acceptanceDatabases=[...frozen.compiledSite.d1_databases,...frozen.compiledExecutor.d1_databases];
  check(!acceptanceDatabases.some(db=>db.database_id.toLowerCase()===packet.resources.executorDatabase.id.toLowerCase()));
  // Vite emits separate ESM chunks. Wrangler needs this candidate's module rules even if the previous public version was monolithic.
  pair.site.no_bundle=frozen.compiledSite.no_bundle;
  pair.site.rules=frozen.compiledSite.rules;
  if(packet.activation.mode === "production") check(frozen.names.has("executor/migrations/0003_document_production.sql"));
  const out=resolve(root,"outputs/materials-production"), destination=join(out,outputName);
  await assertNoLinks(out,true);
  await mkdir(out,{recursive:true});
  const lockPath=join(out,"."+outputName+".lock");
  const lock=await open(lockPath,"wx",0o600);
  let stage;
  try {
    check(!await exists(destination));
    stage=await mkdtemp(join(out,".preparing-"+outputName+"-"));
    for (const file of frozen.index.artifacts) {
      const source=await bytes(join(frozen.directory,file.path));
      check(sha256(source) === file.sha256);
      let output=source;
      if(file.path === "site/server/index.js") await verifyEntrypoints(source,["default","DocumentSite"]);
      if(file.path === "executor/index.mjs") await verifyEntrypoints(source,["default","DocumentExecutorEntrypoint","DocumentWorkflow"]);
      if(file.path === "site/server/wrangler.json") output=Buffer.from(JSON.stringify(pair.site,null,2)+"\n");
      if(file.path === "executor/wrangler.json") output=Buffer.from(JSON.stringify(pair.executor,null,2)+"\n");
      const path=join(stage,file.path);
      await mkdir(dirname(path),{recursive:true}); await writeFile(path,output,{flag:"wx"});
    }
    const artifacts=await captureFiles(stage), artifactTreeSha256=sha256(JSON.stringify(artifacts));
    check(artifacts.length === frozen.index.artifacts.length);
    const configs=new Set(["site/server/wrangler.json","executor/wrangler.json"]);
    check(artifacts.every((file,i)=>file.path===frozen.index.artifacts[i].path && (configs.has(file.path) || file.sha256===frozen.index.artifacts[i].sha256)));
    await writeFile(join(stage,"artifact-index.json"),JSON.stringify({treeSha256:artifactTreeSha256,artifacts},null,2)+"\n",{flag:"wx"});
    const grantEvidence = pair.checkGrant ? await pair.checkGrant() : {};
    const record={formatVersion:1,mode:packet.activation.mode,...grantEvidence,candidate:frozen.candidate.candidate,sourceTree:frozen.candidate.tree,
      sourceBundleSha256:packet.source.bundleSha256,sourceVerificationSha256:packet.source.verificationSha256,closedArtifactTreeSha256:frozen.index.treeSha256,
      executorRebuiltFromCommit:true,migrationsMatchedGitTree:true,
      baselineVersion:baseline.versionId,baselineDeployment:baseline.deploymentId,baselineConfigSha256:baseline.configSha256,
      baselineBindings:baseline.bindingCount,files:artifacts.length,artifactTreeSha256,changedArtifactPaths:[...configs],
      siteMigrations:artifacts.filter(f=>f.path.startsWith("site/server/drizzle/")).map(f=>f.path),
      executorMigrations:artifacts.filter(f=>f.path.startsWith("executor/migrations/")).map(f=>f.path),
      deployments:0,remoteMigrations:0,modelCalls:0};
    await writeFile(join(stage,"verification.json"),JSON.stringify(record,null,2)+"\n",{flag:"wx"});
    // The grant can expire while the evidence file is being written.
    if (pair.checkGrant) await pair.checkGrant();
    await rename(stage,destination); stage=undefined;
    return record;
  } finally {
    if(stage) {
      check(dirname(resolve(stage))===out && basename(stage).startsWith(".preparing-"+outputName+"-"));
      await assertNoLinks(stage); await rm(stage,{recursive:true,force:true});
    }
    await lock.close(); await rm(lockPath);
  }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    check(process.argv.length===4);
    const result=await prepareMaterialsProductionPackage(process.cwd(),resolve(process.argv[2]),process.argv[3]);
    console.log(`Prepared local ${result.mode} materials package with ${result.files} verified files. No deployment performed.`);
  } catch {
    process.stderr.write("Public materials package rejected. Check the reviewed packet, baseline readbacks, frozen files and new output name.\n");
    process.exitCode=1;
  }
}
