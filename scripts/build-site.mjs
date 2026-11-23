#!/usr/bin/env node
// Builds the landing page (site/ → dist-site/) with the latest GitHub release
// baked in, so download links work without JavaScript and visitors never hit
// the GitHub API rate limit. Run by .github/workflows/pages.yml on every
// published release; run locally with `npm run site:build`.
//
// Env: GITHUB_TOKEN (optional, raises the API rate limit),
//      GITHUB_REPOSITORY (defaults to aloisiot/grabbit).
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "site");
const outDir = join(root, "dist-site");
const repo = process.env.GITHUB_REPOSITORY || "aloisiot/grabbit";
const releasesUrl = `https://github.com/${repo}/releases/latest`;

// Which release file each download button points to. Tauri puts the version
// in every file name, so they're matched by pattern rather than by name.
const ASSET_PATTERNS = {
  "mac-arm": /_aarch64\.dmg$/,
  "mac-x64": /_x64\.dmg$/,
  "win-exe": /_x64-setup\.exe$/,
  "win-msi": /_x64_[\w-]+\.msi$/,
  "linux-appimage": /\.AppImage$/,
  "linux-deb": /\.deb$/,
  "linux-rpm": /\.rpm$/,
};

async function fetchLatestRelease() {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "grabbit-site-build" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  // /releases/latest only returns published, non-draft, non-prerelease releases.
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (res.status === 404) return null; // No published release yet.
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatSize(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function summarize(release) {
  if (!release) return { version: null, date: null, url: releasesUrl, assets: {} };
  const assets = {};
  for (const [key, pattern] of Object.entries(ASSET_PATTERNS)) {
    const a = release.assets.find((x) => pattern.test(x.name));
    if (a) assets[key] = { name: a.name, url: a.browser_download_url, size: a.size };
    else console.warn(`warning: no asset matches ${key} (${pattern}); its button links to the releases page`);
  }
  return {
    version: release.tag_name.replace(/^v/, ""),
    date: release.published_at,
    url: release.html_url,
    assets,
  };
}

function render(template, data) {
  const values = {
    version: data.version ?? "—",
    date: data.date ? formatDate(data.date) : "soon",
    release_url: data.url,
  };
  for (const key of Object.keys(ASSET_PATTERNS)) {
    const a = data.assets[key];
    values[`href:${key}`] = a ? a.url : releasesUrl;
    values[`size:${key}`] = a ? formatSize(a.size) : "";
  }
  const html = template.replace(/\{\{([\w:-]+)\}\}/g, (m, key) => {
    if (!(key in values)) throw new Error(`Unknown placeholder ${m} in site/index.html`);
    return escapeHtml(values[key]);
  });
  // Drop the " · " that would trail an empty size, e.g. ".dmg · ".
  return html.replace(/ · <\/span>/g, "</span>");
}

const release = await fetchLatestRelease();
const data = summarize(release);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(srcDir, outDir, { recursive: true });
const template = await readFile(join(srcDir, "index.html"), "utf8");
await writeFile(join(outDir, "index.html"), render(template, data));
await writeFile(join(outDir, "latest.json"), JSON.stringify(data, null, 2) + "\n");
// Serve files as-is (no Jekyll processing on GitHub Pages).
await writeFile(join(outDir, ".nojekyll"), "");

console.log(
  data.version
    ? `Built dist-site/ for v${data.version} with ${Object.keys(data.assets).length}/${Object.keys(ASSET_PATTERNS).length} downloads`
    : "Built dist-site/ with no published release (buttons link to the releases page)",
);
