#!/usr/bin/env node
// Remove Grabbit's locally installed components (yt-dlp, ffmpeg, ffprobe,
// deno) so the next launch shows the first-run setup again.
//
//   npm run reset                  remove the components only (keeps settings and history)
//   npm run reset -- --all         remove everything: components, settings and history
//   npm run reset -- --dry-run     show what would be removed without deleting anything
//
// Works on macOS, Windows and Linux. The folder is derived from the bundle
// identifier in src-tauri/tauri.conf.json, the same way Tauri's
// app_data_dir() resolves it. Quit Grabbit before running this.

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { identifier } = JSON.parse(readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"));

const args = new Set(process.argv.slice(2));
const all = args.has("--all");
const dryRun = args.has("--dry-run");
const unknown = [...args].filter((a) => a !== "--all" && a !== "--dry-run");
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(", ")}\nUsage: npm run reset [-- --all] [-- --dry-run]`);
  process.exit(1);
}

function appDataDir() {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", identifier);
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), identifier);
    default:
      return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), identifier);
  }
}

function sizeOf(path) {
  const s = statSync(path);
  if (!s.isDirectory()) return s.size;
  return readdirSync(path).reduce((total, name) => total + sizeOf(join(path, name)), 0);
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

const dataDir = appDataDir();
const target = all ? dataDir : join(dataDir, "bin");

if (!existsSync(target)) {
  console.log(`Nothing to remove: ${target} doesn't exist.`);
  process.exit(0);
}

const contents = readdirSync(target);
const size = mb(sizeOf(target));
console.log(`${dryRun ? "Would remove" : "Removing"} ${target} (${size})`);
for (const name of contents) console.log(`  - ${name}`);

if (dryRun) {
  console.log("Dry run: nothing was deleted.");
  process.exit(0);
}

try {
  rmSync(target, { recursive: true, force: true });
} catch (e) {
  console.error(`Couldn't remove it: ${e.message}\nIs Grabbit still running? Quit it and try again.`);
  process.exit(1);
}
console.log(
  all
    ? "Done. Components, settings and history were removed."
    : "Done. Settings and history were kept. Grabbit will show the setup screen on its next launch.",
);
