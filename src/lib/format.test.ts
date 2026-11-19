import { describe, expect, it } from "vitest";
import {
  fileName,
  formatBytes,
  formatDuration,
  formatEta,
  formatSpeed,
  heightLabel,
  looksLikeUrl,
  pickHeight,
} from "./format";

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
    expect(formatBytes(3.25 * 1024 ** 3)).toBe("3.3 GB");
  });
  it("handles missing values", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
    expect(formatSpeed(null)).toBe("");
    expect(formatSpeed(2048)).toBe("2.0 KB/s");
  });
});

describe("durations", () => {
  it("formats clock times", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(null)).toBe("");
  });
  it("formats eta", () => {
    expect(formatEta(12)).toBe("12s left");
    expect(formatEta(180)).toBe("3m left");
    expect(formatEta(3900)).toBe("1h 5m left");
    expect(formatEta(undefined)).toBe("");
  });
});

describe("pickHeight", () => {
  it("keeps the preferred height when available", () => {
    expect(pickHeight([2160, 1080, 720], 1080)).toBe(1080);
  });
  it("falls back to the best height below the preference", () => {
    expect(pickHeight([720, 480, 360], 1080)).toBe(720);
    expect(pickHeight([2160, 1440], 1080)).toBe(null);
  });
  it("respects 'best' and unknown formats", () => {
    expect(pickHeight([1080], null)).toBe(null);
    expect(pickHeight([], 720)).toBe(720);
  });
});

describe("misc", () => {
  it("labels heights", () => {
    expect(heightLabel(2160)).toBe("2160p (4K)");
    expect(heightLabel(1080)).toBe("1080p (HD)");
    expect(heightLabel(360)).toBe("360p");
  });
  it("extracts file names on any OS", () => {
    expect(fileName("/Users/me/Downloads/a [x].mp4")).toBe("a [x].mp4");
    expect(fileName("C:\\Users\\me\\b.mp3")).toBe("b.mp3");
    expect(fileName(null)).toBe("");
  });
  it("recognises links", () => {
    expect(looksLikeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(looksLikeUrl("  http://youtu.be/abc ")).toBe(true);
    expect(looksLikeUrl("not a link")).toBe(false);
    expect(looksLikeUrl("ftp://x.y")).toBe(false);
  });
});
