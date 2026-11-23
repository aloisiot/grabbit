import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LOCALES, loadDictionaries, renderLocale } from "./site-i18n.mjs";

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

  it("throws on unknown keys", () => {
    const locale = LOCALES[0];
    expect(() => renderLocale("{{t:nope}}", { locale, dicts, values, siteUrl: "/" })).toThrow(/Unknown key/);
    expect(() => renderLocale("{{nope}}", { locale, dicts, values, siteUrl: "/" })).toThrow(/Unknown placeholder/);
  });
});
