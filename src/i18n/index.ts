// Tiny typed i18n: `useT()` in components, `getT()` in plain helpers.
// All locales are bundled (a few KB each) so switching never flashes English.
import { create } from "zustand";
import { en, type Messages } from "./locales/en";
import { ptBR } from "./locales/pt-BR";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { de } from "./locales/de";

export type { Messages };

/** `flag` is an emoji: native <select> options can only show text. */
export const LOCALES = {
  en: { name: "English", flag: "🇬🇧", messages: en },
  "pt-BR": { name: "Português (Brasil)", flag: "🇧🇷", messages: ptBR },
  es: { name: "Español", flag: "🇪🇸", messages: es },
  fr: { name: "Français", flag: "🇫🇷", messages: fr },
  de: { name: "Deutsch", flag: "🇩🇪", messages: de },
} as const;


export type Locale = keyof typeof LOCALES;
/** What the user picked in Settings; "system" follows the OS language. */
export type LanguagePref = "system" | Locale;

export function isLocale(x: unknown): x is Locale {
  return typeof x === "string" && x in LOCALES;
}

/** Best supported match for a BCP 47 tag list: pt-PT → pt-BR, fr-CA → fr, otherwise en. */
export function matchLocale(tags: readonly string[]): Locale {
  for (const tag of tags) {
    if (isLocale(tag)) return tag;
    const base = tag.toLowerCase().split("-")[0];
    if (base === "pt") return "pt-BR";
    if (isLocale(base)) return base;
  }
  return "en";
}

export function systemLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

interface LocaleState {
  locale: Locale;
  t: Messages;
  setLanguage: (pref: LanguagePref) => void;
}

function apply(locale: Locale) {
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  return { locale, t: LOCALES[locale].messages };
}

export const useLocale = create<LocaleState>((set) => ({
  ...apply(systemLocale()),
  setLanguage: (pref) => set(apply(pref === "system" ? systemLocale() : pref)),
}));

/** Messages for the active locale; re-renders the component when it changes. */
export function useT(): Messages {
  return useLocale((s) => s.t);
}

/** Messages outside React (formatters, stores). */
export function getT(): Messages {
  return useLocale.getState().t;
}

export function getLocale(): Locale {
  return useLocale.getState().locale;
}

// ---------------------------------------------------------------------------
// Backend codes → text
// ---------------------------------------------------------------------------

/**
 * The Rust side reports user-facing errors as "E:code" or "E:code:detail".
 * Anything else (an OS or yt-dlp message) is shown as-is.
 */
export function describeError(raw: unknown, t: Messages = getT()): string {
  const text = typeof raw === "string" ? raw : raw instanceof Error ? raw.message : String(raw);
  return text
    .split("\n")
    .map((line) => {
      const m = /^E:([a-z0-9_]+)(?::([\s\S]*))?$/.exec(line);
      if (!m) return line;
      const entry = (t.errors as Record<string, string | ((d: string) => string)>)[m[1]];
      if (entry == null) return m[2] ?? m[1];
      return typeof entry === "function" ? entry(m[2] ?? "") : entry;
    })
    .join("\n");
}

const POSTPROCESSORS: Record<string, keyof Messages["queue"]["stage"]> = {
  Merger: "merging",
  ExtractAudio: "convertingAudio",
  VideoRemuxer: "remuxing",
  VideoConvertor: "remuxing",
  EmbedThumbnail: "embeddingThumbnail",
  FFmpegMetadata: "writingMetadata",
  Metadata: "writingMetadata",
  EmbedSubtitle: "embeddingSubtitles",
  SubtitlesConvertor: "convertingSubtitles",
  ThumbnailsConvertor: "convertingThumbnail",
  FixupM3u8: "fixingUp",
  FixupM4a: "fixingUp",
  FixupStretched: "fixingUp",
  FixupDuplicateMoov: "fixingUp",
  FixupTimestamp: "fixingUp",
  FixupDuration: "fixingUp",
  MoveFiles: "finishing",
};

/** Job stage codes from the backend: "starting", "cancelling", "downloading", "part:2", "pp:Merger". */
export function stageLabel(stage: string | null, t: Messages = getT()): string | null {
  if (!stage) return null;
  const s = t.queue.stage;
  if (stage === "starting") return s.starting;
  if (stage === "cancelling") return s.cancelling;
  if (stage === "downloading") return s.downloading;
  if (stage.startsWith("part:")) return s.downloadingPart(Number(stage.slice(5)));
  if (stage.startsWith("pp:")) {
    const name = stage.slice(3);
    const key = POSTPROCESSORS[name];
    return key ? (s[key] as string) : s.processingNamed(name);
  }
  return stage;
}
