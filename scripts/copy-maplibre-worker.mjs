/**
 * Turbopack cannot bundle MapLibre GL's internal Web Worker module (it needs
 * `new Worker(url, { type: "module" })` pointed at a real, statically-served
 * file — bundling it resolves to an empty URL and the worker silently never
 * starts, so the map never finishes loading). Copying the two files MapLibre
 * ships for exactly this purpose into `public/` lets `maplibregl.setWorkerUrl()`
 * point at a plain static asset instead. Re-run this after every `npm install`
 * that changes the `maplibre-gl` version (also runs automatically, see the
 * "postinstall" script in package.json).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceDir = join(projectRoot, "node_modules", "maplibre-gl", "dist");
const destDir = join(projectRoot, "public", "vendor");

mkdirSync(destDir, { recursive: true });

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(sourceDir, file), join(destDir, file));
}

console.log("Copied maplibre-gl worker files into public/vendor/.");
