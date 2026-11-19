import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import sharp from "sharp";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

test("rebuilds the complete brand assets outside the checkout without system fonts", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "arc-brand-assets-"));
  try {
    const result = spawnSync(process.execPath, [
      join(projectRoot, "scripts/export-arc-logo.mjs"), "--output-dir", outputRoot,
    ], { cwd: tmpdir(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const logo = await readFile(join(outputRoot, "public/brand/arc-logo.svg"), "utf8");
    assert.match(logo, /<path /);
    assert.match(logo, /#237a74/);
    assert.doesNotMatch(logo, /#f0643e|<text|<image/);
    for (const [file, width, height, transparent] of [
      ["public/og.png", 1672, 941, false],
      ["docs/brand/arc-identity.png", 1440, 720, false],
      ["docs/brand/arc-logo.png", 1296, 528, true],
      ["docs/brand/arc-logo-light.png", 1296, 528, true],
      ["docs/brand/arc-mark.png", 512, 512, true],
      ["docs/brand/arc-mark-light.png", 512, 512, true],
    ]) {
      const metadata = await sharp(join(outputRoot, file)).metadata();
      assert.equal(metadata.width, width, file);
      assert.equal(metadata.height, height, file);
      assert.equal(metadata.hasAlpha, transparent, file);
    }
    for (const file of ["docs/brand/arc-identity.svg", "docs/brand/social-cover.svg"]) {
      const svg = await readFile(join(outputRoot, file), "utf8");
      assert.doesNotMatch(svg, /<text|font-family|data:font|https?:\/\/(?!www\.w3\.org)/);
    }
    assert.equal(await readFile(join(outputRoot, "public/favicon.svg"), "utf8"),
      await readFile(join(projectRoot, "public/favicon.svg"), "utf8"));
  } finally {
    assert.ok(resolve(outputRoot).startsWith(`${resolve(tmpdir())}${sep}arc-brand-assets-`));
    await rm(outputRoot, { recursive: true, force: true });
  }
});
