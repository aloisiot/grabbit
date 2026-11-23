import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAQ_COUNT, LOCALES, loadDictionaries, renderLocale, sitemapXml } from "./site-i18n.mjs";

const site = join(fileURLToPath(new URL(".", import.meta.url)), "..", "site");
const values = {
  version: "1.2.3",
  date: "<today>",
  release_url: "https://example.com/r",
  ...Object.fromEntries(
    ["mac-arm", "mac-x64", "win-exe", "win-msi", "linux-appimage", "linux-deb", "linux-rpm"].flatMap((k) => [
      [`href:${k}`, `https://example.com/${k}`],
      [`size:${k}`, "10 MB"],
    ]),
  ),
};

describe("site i18n", async () => {
  const dicts = await loadDictionaries(join(site, "i18n"));
  const template = await readFile(join(site, "index.html"), "utf8");

  it("every dictionary has the same keys as en.json", () => {
    const en = Object.keys(dicts.en).sort();
    for (const l of LOCALES) expect(Object.keys(dicts[l.code]).sort(), l.code).toEqual(en);
  });

  it("renders every locale with no leftover placeholders", () => {
    for (const locale of LOCALES) {
      const html = renderLocale(template, { locale, dicts, values, siteUrl: "https://x.test/g/" });
      expect(html).not.toMatch(/\{\{|\{version\}|\{date\}/);
      expect(html).toContain(`<html lang="${locale.code}">`);
      expect(html).toContain('hreflang="x-default" href="https://x.test/g/"');
      expect(html).toContain("&#60;today&#62;"); // values are escaped
      expect(html).toContain(locale.code === "en" ? 'id="lang-suggest"' : 'href="../style.css"');
    }
  });

  it("adds canonical, social and structured-data tags", () => {
    for (const siteUrl of ["https://x.test/g/", "https://example.com/"]) {
      for (const locale of LOCALES) {
        const page = siteUrl + locale.dir;
        const html = renderLocale(template, { locale, dicts, values, siteUrl, googleVerification: "tok" });
        expect(html).toContain(`<link rel="canonical" href="${page}">`);
        expect(html).toContain(`<meta property="og:url" content="${page}">`);
        expect(html).toContain(`<meta property="og:image" content="${siteUrl}assets/og.png">`);
        expect(html).toContain('<meta name="google-site-verification" content="tok">');
        expect(html.match(/og:locale:alternate/g)).toHaveLength(LOCALES.length - 1);
        // Every absolute URL points at the configured site (or a known external host).
        for (const [, url] of html.matchAll(/(?:href|content)="(https?:\/\/[^"]+)"/g)) {
          expect(url.startsWith(siteUrl) || /github\.com|ffmpeg\.org|deno\.com|example\.com\/|opensource\.org/.test(url), url).toBe(true);
        }

        const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
        const [app, faq] = ld["@graph"];
        expect(app["@type"]).toBe("SoftwareApplication");
        expect(app.url).toBe(page);
        expect(app.softwareVersion).toBe("1.2.3");
        expect(app.inLanguage).toBe(locale.code);
        expect(faq["@type"]).toBe("FAQPage");
        expect(faq.mainEntity).toHaveLength(FAQ_COUNT);
        expect(faq.mainEntity[0].name).toBe(dicts[locale.code]["faq.q1"]);
        expect(html.match(/<details>\s*<summary>/g)).toHaveLength(FAQ_COUNT);
      }
    }
  });

  it("omits the verification tag and unknown versions", () => {
    const html = renderLocale(template, { locale: LOCALES[0], dicts, values: { ...values, version: "—" }, siteUrl: "https://x.test/" });
    expect(html).not.toContain("google-site-verification");
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    expect(ld["@graph"][0]).not.toHaveProperty("softwareVersion");
  });

  it("builds a sitemap with every language linked", () => {
    const xml = sitemapXml("https://x.test/g/", "2026-11-23");
    expect(xml.match(/<url>/g)).toHaveLength(LOCALES.length);
    expect(xml.match(/xhtml:link/g)).toHaveLength(LOCALES.length * (LOCALES.length + 1));
    expect(xml).toContain("<loc>https://x.test/g/pt-br/</loc>");
    expect(xml).toContain('hreflang="x-default" href="https://x.test/g/"');
  });

  it("throws on unknown keys", () => {
    const locale = LOCALES[0];
    expect(() => renderLocale("{{t:nope}}", { locale, dicts, values, siteUrl: "/" })).toThrow(/Unknown key/);
    expect(() => renderLocale("{{nope}}", { locale, dicts, values, siteUrl: "/" })).toThrow(/Unknown placeholder/);
  });
});
