import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const rootDir = resolve(process.cwd());
const distDir = resolve(rootDir, "dist");
const assetsSrc = resolve(rootDir, "assets");
const assetsDest = resolve(distDir, "assets");
const perksDataSrc = resolve(rootDir, "killer-perks-data-2.json");
const perksDataDest = resolve(distDir, "killer-perks-data-2.json");

if (!existsSync(distDir)) {
  throw new Error("dist directory does not exist. Run vite build first.");
}

mkdirSync(distDir, { recursive: true });
cpSync(assetsSrc, assetsDest, { recursive: true, force: true });
cpSync(perksDataSrc, perksDataDest, { force: true });
