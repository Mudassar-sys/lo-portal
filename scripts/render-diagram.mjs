// Render docs/architecture.mmd to docs/architecture.svg.
//
//   npm run diagram
//
// Two things this does that a bare mmdc call does not.
//
// htmlLabels is off in the config, because mermaid otherwise puts label text
// inside a foreignObject, and an SVG referenced by an img tag is rendered in a
// restricted mode where that HTML never paints. The diagram would ship as a
// set of empty boxes.
//
// mermaid writes width="100%" and no height, so the file has no intrinsic size
// and a browser falls back to 300 pixels wide. The viewBox already carries the
// real size, so it is copied onto the element here.

import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const SVG = "docs/architecture.svg";

const result = spawnSync(
  "npx",
  [
    "-y", "-p", "@mermaid-js/mermaid-cli", "mmdc",
    "-i", "docs/architecture.mmd",
    "-o", SVG,
    "-c", "docs/architecture.theme.json",
    "-b", "#0a111a",
    "-w", "1100",
  ],
  { encoding: "utf8", shell: true, stdio: "inherit" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

let svg = readFileSync(SVG, "utf8");

const viewBox = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
if (!viewBox) {
  console.error("the rendered file has no viewBox, so its size cannot be set");
  process.exit(1);
}
const width = Math.round(Number(viewBox[3]));
const height = Math.round(Number(viewBox[4]));

svg = svg.replace('width="100%"', `width="${width}" height="${height}"`);

if (/foreignObject/.test(svg)) {
  console.error("the rendered file contains a foreignObject, so its labels would not paint in an img tag");
  process.exit(1);
}

writeFileSync(SVG, svg, "utf8");
console.log(`${SVG}  ${width}x${height}, no foreignObject`);
