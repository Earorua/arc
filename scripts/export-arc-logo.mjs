import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { create } from "fontkit";
import sharp from "sharp";
import { decompress } from "wawoff2";
import art from "../app/components/brand/arc-lettering.json" with { type: "json" };
import captionGlyphs from "../docs/brand/source/caption-glyphs.json" with { type: "json" };

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output-dir")) {
  throw new Error("Usage: node scripts/export-arc-logo.mjs [--output-dir directory]");
}
const outputRoot = args.length ? resolve(args[1]) : projectRoot;
const { ink, mist, accent, muted, hairline, lightMuted, deepLine } = art.palette;
const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
const circle = ({ cx, cy, r, fill }) => `<circle cx="${cx}" cy="${cy}" r="${r}"${fill ? ` fill="${fill}"` : ""}/>`;
const mark = `<path d="${art.a}"/>${circle(art.waypoint)}`;
const wordmark = `${mark}<path d="${art.r}"/><path d="${art.c}"/>${circle(art.period)}`;
const micro = `<rect width="32" height="32" rx="6" fill="${mist}"/><path fill="${ink}" d="M2.3 27.5C4.7 17.1 11.4 7.6 18.8 4H20L29.8 27.5H23.6L17 11.6C12.9 14.3 9.2 18.8 6.7 23.2C8.3 21.6 9.9 20.3 11.6 19.4L12.7 21.1C9.7 22.6 7.3 24.8 5.4 27.5Z"/><circle cx="16.3" cy="18.4" r="2.3" fill="${accent}"/>`;
const svg = (width, height, body, label, viewBox = `0 0 ${width} ${height}`, color = ink) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" color="${color}" role="img" aria-label="${escape(label)}">\n${body}\n</svg>\n`;
const rect = (x, y, width, height, fill) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"/>`;
const line = (x1, y1, x2, y2, stroke, width = 1) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${stroke}" stroke-width="${width}"/>`;
const group = (x, y, scale, fill, body) => `<g transform="translate(${x} ${y}) scale(${scale})" fill="${fill}">${body}</g>`;
const output = async (file, data) => {
  const target = join(outputRoot, file);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
};
const raster = async (source, file, width, opaque = false) => {
  const sourceWidth = Number(source.match(/\bwidth="(\d+)"/)[1]);
  const density = Math.max(144, Math.ceil(width / sourceWidth * 72));
  let image = sharp(Buffer.from(source), { density }).resize({ width });
  if (opaque) image = image.removeAlpha();
  await output(file, await image.png({ compressionLevel: 9 }).toBuffer());
};

// Resolve the already packaged typefaces. Text is outlined before rasterization,
// so the exporter never depends on installed fonts or a local browser.
const fonts = {};
for (const [name, file] of [
  ["display", "@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2"],
  ["sans", "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2"],
]) {
  // The WASM decoder shares an output buffer: finish copying each font first.
  fonts[name] = create(Buffer.from(await decompress(await readFile(require.resolve(file)))));
}

function text(x, y, content, { family = "display", size, fill = ink, spacing = 0, end = false }) {
  const base = fonts[family];
  const font = base.getVariation({ wght: 400, ...(base.variationAxes.opsz ? { opsz: size } : {}) });
  const run = font.layout(content);
  const scale = size / font.unitsPerEm;
  const width = run.positions.reduce((sum, position) => sum + position.xAdvance * scale, 0) + spacing * (run.glyphs.length - 1);
  let offset = end ? -width : 0;
  const paths = run.glyphs.map((glyph, index) => {
    const position = run.positions[index];
    const path = `<path transform="translate(${offset + position.xOffset * scale} ${-position.yOffset * scale}) scale(${scale} ${-scale})" d="${glyph.path.toSVG()}"/>`;
    offset += position.xAdvance * scale + spacing;
    return path;
  }).join("");
  return `<g aria-label="${escape(content)}" transform="translate(${x} ${y})" fill="${fill}">${paths}</g>`;
}

function caption(x, y, content, { size = 15, fill = muted, spacing = 1.45, end = false } = {}) {
  const scale = size / captionGlyphs.unitsPerEm;
  const glyphs = [...content].map(character => {
    const glyph = captionGlyphs.glyphs[character];
    if (!glyph) throw new Error(`The preserved caption alphabet does not include ${JSON.stringify(character)}`);
    return glyph;
  });
  const width = glyphs.reduce((sum, glyph) => sum + glyph.advanceWidth * scale, 0) + spacing * (glyphs.length - 1);
  let offset = end ? -width : 0;
  const paths = glyphs.map(glyph => {
    const path = `<path transform="translate(${offset} 0) scale(${scale} ${-scale})" d="${glyph.path}"/>`;
    offset += glyph.advanceWidth * scale + spacing;
    return path;
  }).join("");
  return `<g aria-label="${escape(content)}" transform="translate(${x} ${y})" fill="${fill}">${paths}</g>`;
}

for (const [name, label, viewBox, width, height, shapes, pngWidth] of [
  ["arc-logo", "Arc.", art.viewBox, 216, 88, wordmark, 1296],
  ["arc-mark", "Arc. monogram", art.markViewBox, 100, 100, mark, 512],
]) {
  for (const [suffix, color] of [["", ink], ["-light", mist]]) {
    const vector = svg(width, height, `<g fill="currentColor">${shapes}</g>`, label, viewBox, color);
    await output(`public/brand/${name}${suffix}.svg`, vector);
    await raster(vector, `docs/brand/${name}${suffix}.png`, pngWidth);
  }
}
await output("public/favicon.svg", svg(32, 32, micro, "Arc."));

// Geometry, copy and scale come from the completed November 4 identity studio.
const plate = svg(1440, 720,
  rect(0, 0, 1440, 720, mist) + rect(888, 0, 552, 720, ink) +
  caption(64, 62, "PRECISION LEARNING") + caption(824, 62, "01   /   WORDMARK", { end: true }) +
  line(64, 88.5, 824, 88.5, hairline) + group(85, 172, 3.38, ink, wordmark) +
  text(91, 527, "Learn only what moves you forward.", { size: 39, spacing: -1.5 }) +
  line(64, 613.5, 824, 613.5, hairline) + caption(64, 669, "METHOD") +
  text(824, 669, "Understand   /   Build   /   Prove", { family: "sans", size: 18, spacing: 0.1, end: true }) +
  caption(944, 62, "02   /   MONOGRAM", { fill: lightMuted }) + line(944, 88.5, 1384, 88.5, deepLine) +
  group(1030.5, 197, 2.82, mist, mark) + line(944, 613.5, 1384, 613.5, deepLine) +
  caption(944, 669, "TAB ICON", { fill: lightMuted }) +
  group(1086, 652, 0.5, ink, micro) + caption(1112, 666, "16", { size: 14, fill: lightMuted, spacing: 0 }) +
  group(1182, 648, 0.75, ink, micro) + caption(1216, 666, "24", { size: 14, fill: lightMuted, spacing: 0 }) +
  group(1286, 644, 1, ink, micro) + caption(1328, 666, "32 px", { size: 14, fill: lightMuted, spacing: 0 }),
  "Arc. wordmark, monogram and browser icon");
await output("docs/brand/arc-identity.svg", plate);
await raster(plate, "docs/brand/arc-identity.png", 1440, true);

const cover = svg(1672, 941,
  rect(0, 0, 1672, 941, mist) + caption(105, 79, "CAREER INTELLIGENCE") +
  caption(1567, 79, "UNDERSTAND   /   BUILD   /   PROVE", { end: true }) +
  line(105, 105, 1567, 105, hairline) + group(102, 230, 3.4, ink, wordmark) +
  text(108, 632, "Learn only what", { size: 72, spacing: -2.4 }) +
  text(108, 705, "moves you forward.", { size: 72, spacing: -2.4 }) +
  caption(108, 858, "A PRECISION LEARNING SYSTEM") +
  `<g fill="none"><path d="M670 980C874 906 1007 767 1136 545C1203 430 1253 361 1328 299" stroke="${ink}" stroke-width="3.5"/><path d="M1328 299C1419 223 1531 179 1707 139" stroke="${muted}" stroke-width="2.2"/></g>` +
  `<circle cx="1328" cy="299" r="16.5" fill="${mist}"/><circle cx="1328" cy="299" r="11.5" fill="${accent}"/>` +
  line(1354, 299, 1384, 299, muted) + caption(1398, 304, "TODAY"),
  "Arc. — Learn only what moves you forward");
await output("docs/brand/social-cover.svg", cover);
await raster(cover, "public/og.png", 1672, true);
console.log(`Exported Arc brand assets to ${outputRoot}`);
