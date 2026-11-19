# Original identity source — November 4, 2026

This directory preserves the completed original logo geometry and editable studio source from the historical `v8-openrouter-research-beta` checkout. Its warm paper, charcoal and orange colors describe that original artwork, not the current application theme.

The original `export-arc-logo.mjs` emits the two outline SVGs. `studio/study.mjs` preserves the design studies; `studio/plate.svg` and `studio/cover.svg` preserve the editable compositions and embedded typefaces. `README.original.md` is the original delivery note.

The studio scripts are historical records. `studio/export.mjs` expects SVG group IDs that were removed when the final logo was centralized in JSON, and `studio/finish.mjs` expects locally rendered `*-2x.png` inputs. Do not run these scripts against the current application. Use `npm run brand:export` from the repository root for a complete portable export in the current palette.

The unchanged original raster files and ZIP remain in the historical local studio; they are not duplicated here because the editable artwork and current exports are included.
