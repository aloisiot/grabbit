// Landing-page localisation: one template (site/index.html), one dictionary per
// language (site/i18n/<code>.json), one static page per language. English is
// served at the root, every other language under its own folder (pt-br/, es/…).
// Used by build-site.mjs; pure apart from reading the dictionaries.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const LOCALES = [
  { code: "en", dir: "", ogLocale: "en_US", name: "English", short: "EN" },
  { code: "pt-BR", dir: "pt-br/", ogLocale: "pt_BR", name: "Português (Brasil)", short: "PT" },
  { code: "es", dir: "es/", ogLocale: "es_ES", name: "Español", short: "ES" },
  { code: "fr", dir: "fr/", ogLocale: "fr_FR", name: "Français", short: "FR" },
  { code: "de", dir: "de/", ogLocale: "de_DE", name: "Deutsch", short: "DE" },
];

// Small inline flags for the language menu (SVG, so they look the same on
// every OS; Windows has no flag emoji). English uses the UK flag.
const FLAGS = {
  en: '<clipPath id="fl-gb-s"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="fl-gb-t"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#fl-gb-s)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#fl-gb-t)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g>',
  "pt-BR": '<path fill="#009C3B" d="M0 0h60v30H0z"/><path fill="#FFDF00" d="M30 3l25 12-25 12L5 15z"/><circle cx="30" cy="15" r="6.5" fill="#002776"/>',
  es: '<path fill="#AA151B" d="M0 0h60v30H0z"/><path fill="#F1BF00" d="M0 7.5h60v15H0z"/>',
  fr: '<path fill="#ED2939" d="M0 0h60v30H0z"/><path fill="#fff" d="M0 0h40v30H0z"/><path fill="#002395" d="M0 0h20v30H0z"/>',
  de: '<path fill="#FFCE00" d="M0 0h60v30H0z"/><path fill="#DD0000" d="M0 0h60v20H0z"/><path d="M0 0h60v10H0z"/>',
};

/** Flag for a locale; `id` keeps clipPath ids unique when the same flag appears twice on a page. */
export function flagSvg(code, id = "") {
  const body = id ? FLAGS[code].replace(/fl-gb-/g, `fl-gb-${id}-`) : FLAGS[code];
  return `<svg class="flag" viewBox="0 0 60 30" width="20" height="10" aria-hidden="true">${body}</svg>`;
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Number of FAQ entries: keys faq.q1…faq.qN and faq.a1…faq.aN in every dictionary. */
export const FAQ_COUNT = 6;

/** JSON safe to put inside a <script> element. */
const scriptJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

/** Load every dictionary and check each has exactly the keys of en.json. */
export async function loadDictionaries(i18nDir) {
  const dicts = {};
  for (const l of LOCALES) dicts[l.code] = JSON.parse(await readFile(join(i18nDir, `${l.code}.json`), "utf8"));
  const expected = Object.keys(dicts.en).sort();
  for (const l of LOCALES) {
    const keys = Object.keys(dicts[l.code]);
    const missing = expected.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !expected.includes(k));
    if (missing.length || extra.length) {
      throw new Error(
        `site/i18n/${l.code}.json: ${[missing.length && `missing ${missing.join(", ")}`, extra.length && `unexpected ${extra.join(", ")}`]
          .filter(Boolean)
          .join("; ")}`,
      );
    }
  }
  return dicts;
}

/** Relative path from a page in `fromDir` to the site root ("" or "../"). */
const baseFor = (fromDir) => (fromDir ? "../".repeat(fromDir.split("/").filter(Boolean).length) : "");

function alternates(siteUrl) {
  const links = LOCALES.map((l) => `  <link rel="alternate" hreflang="${l.code}" href="${escapeHtml(siteUrl + l.dir)}">`);
  links.push(`  <link rel="alternate" hreflang="x-default" href="${escapeHtml(siteUrl)}">`);
  return links.join("\n");
}

function ogAlternates(current) {
  return LOCALES.filter((l) => l.code !== current.code)
    .map((l) => `  <meta property="og:locale:alternate" content="${l.ogLocale}">`)
    .join("\n");
}

function faqEntries(dict) {
  return Array.from({ length: FAQ_COUNT }, (_, i) => ({ q: dict[`faq.q${i + 1}`], a: dict[`faq.a${i + 1}`] }));
}

/** FAQ as <details> items, so it works without JavaScript. */

function faqHtml(dict) {
  return faqEntries(dict)
    .map(
      ({ q, a }) => `        <details>
          <summary>${escapeHtml(q)}</summary>
          <p>${escapeHtml(a)}</p>
        </details>`,
    )
    .join("\n");
}

/**
 * schema.org data for search engines: the app itself and the FAQ.
 * Google only shows software rich results with ratings, and FAQ rich results
 * for few sites, so this mainly helps engines understand the page.
 */
function jsonLd({ locale, dict, values, pageUrl, siteUrl, repoUrl }) {
  const app = {
    "@type": "SoftwareApplication",
    name: "Grabbit",
    description: dict["meta.description"],
    url: pageUrl,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "macOS, Windows, Linux",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    downloadUrl: values.release_url,
    screenshot: `${siteUrl}assets/screenshot.png`,
    image: `${siteUrl}assets/icon.png`,
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    inLanguage: locale.code,
    sameAs: [repoUrl],
  };
  if (values.version && values.version !== "—") app.softwareVersion = values.version;
  const faq = {
    "@type": "FAQPage",
    inLanguage: locale.code,
    mainEntity: faqEntries(dict).map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  return `  <script type="application/ld+json">${scriptJson({ "@context": "https://schema.org", "@graph": [app, faq] })}</script>`;
}

/** sitemap.xml with every language version linked to the others (hreflang). */
export function sitemapXml(siteUrl, lastmod) {
  const links = [
    ...LOCALES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${escapeHtml(siteUrl + l.dir)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeHtml(siteUrl)}"/>`,
  ].join("\n");
  const urls = LOCALES.map(
    (l) => `  <url>
    <loc>${escapeHtml(siteUrl + l.dir)}</loc>
    <lastmod>${lastmod}</lastmod>
${links}
  </url>`,
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

function languageMenu(current) {
  const base = baseFor(current.dir);
  return LOCALES.map((l) => {
    const attrs = [`href="${base}${l.dir}"`, `hreflang="${l.code}"`, `lang="${l.code}"`];
    if (l.code === current.code) attrs.push('aria-current="page"');
    return `            <li><a ${attrs.join(" ")}>${flagSvg(l.code)}${escapeHtml(l.name)}</a></li>`;
  }).join("\n");
}

/**
 * Root page only: if the visitor's browser prefers another language we have,
 * offer a link to it. Never redirects; "×" hides it for good.
 */
function suggestion(dicts) {
  const offers = {};
  for (const l of LOCALES) {
    if (l.code === "en") continue;
    offers[l.code.split("-")[0].toLowerCase()] = { href: l.dir, lang: l.code, text: dicts[l.code]["suggest.prompt"] };
  }
  // Escape "<" so the JSON can't close the script tag.
  const json = scriptJson(offers);
  const banner = `  <div class="suggest" id="lang-suggest" hidden>
    <div class="wrap suggest-inner"><a id="lang-suggest-link" href=""></a><button type="button" id="lang-suggest-close" aria-label="Dismiss">×</button></div>
  </div>`;
  const script = `  <script>
    (function () {
      var KEY = "grabbit-lang-suggest-dismissed";
      try { if (localStorage.getItem(KEY)) return; } catch (e) {}
      var offers = ${json};
      var tags = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
      for (var i = 0; i < tags.length; i++) {
        var base = String(tags[i]).toLowerCase().split("-")[0];
        if (base === "en") return;
        var o = offers[base];
        if (!o) continue;
        var box = document.getElementById("lang-suggest");
        var link = document.getElementById("lang-suggest-link");
        link.href = o.href; link.lang = o.lang; link.hreflang = o.lang; link.textContent = o.text;
        document.getElementById("lang-suggest-close").onclick = function () {
          box.hidden = true;
          try { localStorage.setItem(KEY, "1"); } catch (e) {}
        };
        box.hidden = false;
        return;
      }
    })();
  </script>`;
  return { banner, script };
}

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/**
 * Render the template for one locale.
 * Placeholders: {{t:key}} (escaped; keys ending in "_html" are trusted markup
 * from our own dictionaries), {{html:name}} (generated markup), and plain
 * values from `values` (escaped). Unknown placeholders throw.
 * `siteUrl` is the absolute site root ending in "/"; `googleVerification`
 * (optional) adds the Search Console verification tag.
 */
export function renderLocale(
  template,
  { locale, dicts, values, siteUrl, repoUrl = "https://github.com/aloisiot/grabbit", googleVerification = "" },
) {
  const dict = dicts[locale.code];
  const pageUrl = siteUrl + locale.dir;
  // {version}/{date} inside dictionary strings; escaped like every value.
  const textVars = { version: escapeHtml(values.version), date: escapeHtml(values.date) };
  const s = suggestion(dicts);
  const html = {
    alternates: alternates(siteUrl),
    languages: languageMenu(locale),
    current_flag: flagSvg(locale.code, "current"),
    og_alternates: ogAlternates(locale),
    faq: faqHtml(dict),
    json_ld: jsonLd({ locale, dict, values, pageUrl, siteUrl, repoUrl }),
    verification: googleVerification
      ? `  <meta name="google-site-verification" content="${escapeHtml(googleVerification)}">`
      : "",
    suggest: locale.code === "en" ? s.banner : "",
    suggest_script: locale.code === "en" ? s.script : "",
  };
  const plain = {
    ...values,
    lang: locale.code,
    lang_short: locale.short,
    og_locale: locale.ogLocale,
    base: baseFor(locale.dir),
    page_url: pageUrl,
    site_url: siteUrl,
  };

  const out = template.replace(/\{\{([\w:.-]+)\}\}/g, (m, key) => {
    if (key.startsWith("t:")) {
      const k = key.slice(2);
      if (!(k in dict)) throw new Error(`Unknown key ${k} (in ${m}) for ${locale.code}`);
      return fill(k.endsWith("_html") ? dict[k] : escapeHtml(dict[k]), textVars);
    }

    if (key.startsWith("html:")) {
      const k = key.slice(5);
      if (!(k in html)) throw new Error(`Unknown placeholder ${m} in site/index.html`);
      return html[k];
    }
    if (!(key in plain)) throw new Error(`Unknown placeholder ${m} in site/index.html`);
    return escapeHtml(plain[key]);
  });
  // Drop the " · " that would trail an empty size, e.g. ".dmg · ".
  return out.replace(/ · <\/span>/g, "</span>");
}
