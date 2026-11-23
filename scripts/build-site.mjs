#!/usr/bin/env node
// Builds the landing page (site/ → dist-site/) with the latest GitHub release
// baked in, so download links work without JavaScript and visitors never hit
// the GitHub API rate limit. One page per language (see site-i18n.mjs):
// English at the root, the others under pt-br/, es/, fr/, de/. Run by
// .github/workflows/pages.yml on every published release; run locally with
// `npm run site:build`.
//
// Env: GITHUB_TOKEN (optional, raises the API rate limit),
//      GITHUB_REPOSITORY (defaults to aloisiot/grabbit),
//      SITE_URL (defaults to https://<owner>.github.io/<repo>/; used for canonical,
//        hreflang, Open Graph and sitemap URLs. Set it when moving to a custom domain),
//      GOOGLE_SITE_VERIFICATION (optional Search Console token).
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES, escapeHtml, loadDictionaries, renderLocale, sitemapXml } from "./site-i18n.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "site");
const outDir = join(root, "dist-site");
const repo = process.env.GITHUB_REPOSITORY || "aloisiot/grabbit";
const releasesUrl = `https://github.com/${repo}/releases/latest`;
const [owner, name] = repo.split("/");
const siteUrl = (process.env.SITE_URL || `https://${owner}.github.io/${name}/`).replace(/\/?$/, "/");
const googleVerification = process.env.GOOGLE_SITE_VERIFICATION || "";

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

function formatDate(iso, locale) {
  return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

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

function valuesFor(data, locale, dict) {
  const values = {
    version: data.version ?? "—",
    date: data.date ? formatDate(data.date, locale.code) : dict["release.soon"],
    release_url: data.url,
  };
  for (const key of Object.keys(ASSET_PATTERNS)) {
    const a = data.assets[key];
    values[`href:${key}`] = a ? a.url : releasesUrl;
    values[`size:${key}`] = a ? formatSize(a.size) : "";
  }
  return values;
}

/**
 * GitHub Pages serves this for any missing path, at any depth, so every link and
 * asset is absolute. Each language's message is shown, in its own language.
 */
function notFoundPage(dicts) {
  const items = LOCALES.map(
    (l) =>
      `      <li lang="${l.code}"><a href="${escapeHtml(siteUrl + l.dir)}">${escapeHtml(dicts[l.code]["notFound.back"])}</a></li>`,
  ).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(dicts.en["notFound.title"])} · Grabbit</title>
  <meta name="color-scheme" content="light dark">
  <link rel="icon" type="image/png" href="${escapeHtml(siteUrl)}assets/favicon.png">
  <link rel="stylesheet" href="${escapeHtml(siteUrl)}style.css">
</head>
<body>
  <main class="wrap not-found">
    <a href="${escapeHtml(siteUrl)}"><img src="${escapeHtml(siteUrl)}assets/icon.png" alt="Grabbit" width="88" height="88"></a>
    <h1>${escapeHtml(dicts.en["notFound.title"])}</h1>
    <ul>
${items}
    </ul>
  </main>
</body>
</html>
`;
}

const release = await fetchLatestRelease();

const data = summarize(release);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(srcDir, outDir, { recursive: true, filter: (src) => !src.startsWith(join(srcDir, "i18n")) });
const template = await readFile(join(srcDir, "index.html"), "utf8");
const dicts = await loadDictionaries(join(srcDir, "i18n"));
for (const locale of LOCALES) {
  const dir = join(outDir, locale.dir);
  await mkdir(dir, { recursive: true });
  const values = valuesFor(data, locale, dicts[locale.code]);
  await writeFile(
    join(dir, "index.html"),
    renderLocale(template, { locale, dicts, values, siteUrl, repoUrl: `https://github.com/${repo}`, googleVerification }),
  );
}
const lastmod = (data.date ?? new Date().toISOString()).slice(0, 10);
await writeFile(join(outDir, "sitemap.xml"), sitemapXml(siteUrl, lastmod));
// Only read at a domain's root, so it takes effect once the site has a custom domain.
await writeFile(join(outDir, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`);
await writeFile(join(outDir, "404.html"), notFoundPage(dicts));
await writeFile(join(outDir, "latest.json"), JSON.stringify(data, null, 2) + "\n");
// Serve files as-is (no Jekyll processing on GitHub Pages).
await writeFile(join(outDir, ".nojekyll"), "");

console.log(
  data.version
    ? `Built dist-site/ (${LOCALES.length} languages) for v${data.version} with ${Object.keys(data.assets).length}/${Object.keys(ASSET_PATTERNS).length} downloads`
    : `Built dist-site/ (${LOCALES.length} languages) with no published release (buttons link to the releases page)`,
);
