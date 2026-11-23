import { afterEach, describe, expect, it } from "vitest";
import { formatBytes, formatEta } from "../lib/format";
import { LOCALES, describeError, matchLocale, stageLabel, useLocale } from ".";
import { makePlural } from "./plural";

afterEach(() => useLocale.getState().setLanguage("en"));

describe("matchLocale", () => {
  it("picks the closest supported locale", () => {
    expect(matchLocale(["pt-BR"])).toBe("pt-BR");
    expect(matchLocale(["pt-PT"])).toBe("pt-BR");
    expect(matchLocale(["fr-CA", "en"])).toBe("fr");
    expect(matchLocale(["de-AT"])).toBe("de");
    expect(matchLocale(["ja", "es-MX"])).toBe("es");
    expect(matchLocale(["ja"])).toBe("en");
  });
});

describe("describeError", () => {
  it("translates backend codes", () => {
    expect(describeError("E:private")).toBe("This video is private.");
    expect(describeError("E:exit_code:2")).toBe("yt-dlp stopped unexpectedly (exit code 2).");
    expect(describeError("E:download_interrupted:reset: by peer")).toBe(
      "Download interrupted: reset: by peer. Check your connection and retry.",
    );
    useLocale.getState().setLanguage("de");
    expect(describeError("E:private")).toBe("Dieses Video ist privat.");
  });
  it("passes plain messages through", () => {
    expect(describeError("Something odd happened")).toBe("Something odd happened");
    expect(describeError(new Error("boom"))).toBe("boom");
    expect(describeError("E:not_a_known_code:detail")).toBe("detail");
  });
  it("handles one code per line", () => {
    expect(describeError("E:private\nraw text")).toBe("This video is private.\nraw text");
  });
});

describe("stageLabel", () => {
  it("maps stage codes", () => {
    expect(stageLabel(null)).toBe(null);
    expect(stageLabel("starting")).toBe("Starting");
    expect(stageLabel("part:2")).toBe("Downloading · part 2");
    expect(stageLabel("pp:Merger")).toBe("Merging video and audio");
    expect(stageLabel("pp:SponsorBlock")).toBe("Processing (SponsorBlock)");
  });
});

describe("localized formatting", () => {
  it("uses the locale's decimal separator and words", () => {
    useLocale.getState().setLanguage("de");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatEta(180)).toBe("noch 3 min");
    useLocale.getState().setLanguage("pt-BR");
    expect(useLocale.getState().t.download.videos(1)).toBe("1 vídeo");
    expect(useLocale.getState().t.download.videos(3)).toBe("3 vídeos");
  });
  it("plural formats numbers", () => {
    expect(makePlural("en")(1200, { one: "# item", other: "# items" })).toBe("1,200 items");
  });
});

describe("locales", () => {
  // tsc already checks the shape; this catches untranslated copies of English.
  it("translate most strings", () => {
    const flat = (o: object, out: string[] = []): string[] => {
      for (const v of Object.values(o)) {
        if (typeof v === "string") out.push(v);
        else if (v && typeof v === "object") flat(v, out);
      }
      return out;
    };
    const english = flat(LOCALES.en.messages);
    for (const [code, { messages }] of Object.entries(LOCALES)) {
      if (code === "en") continue;
      const same = flat(messages).filter((s, i) => s === english[i]).length;
      expect(same / english.length, code).toBeLessThan(0.15);
    }
  });
});
