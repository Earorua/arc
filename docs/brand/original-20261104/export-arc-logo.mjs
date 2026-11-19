import { writeFile } from "node:fs/promises";
import art from "../app/components/brand/arc-lettering.json" with { type: "json" };

const circle = ({ cx, cy, r, fill }) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}"${fill ? ` fill="${fill}"` : ""}/>`;
const mark = [`<path d="${art.a}"/>`, circle(art.waypoint)];
const wordmark = [...mark, `<path d="${art.r}"/>`, `<path d="${art.c}"/>`, circle(art.period)];
const variants = [
  ["arc-logo", "Arc.", art.viewBox, 216, 88, wordmark],
  ["arc-mark", "Arc. monogram", art.markViewBox, 100, 100, mark],
];

for (const [name, label, viewBox, width, height, shapes] of variants) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" color="#171715" role="img" aria-label="${label}">
  <g fill="currentColor">
    ${shapes.join("\n    ")}
  </g>
</svg>
`;
  await writeFile(new URL(`../public/brand/${name}.svg`, import.meta.url), svg);
}
