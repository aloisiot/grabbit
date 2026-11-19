import { describe, expect, it } from "vitest";
import { isInstalling, overallProgress, percentOf, stageText } from "./install";
import type { InstallProgress } from "./types";

const MB = 1024 * 1024;
const p = (over: Partial<InstallProgress>): InstallProgress => ({
  component: "yt-dlp",
  stage: "downloading",
  downloaded: 0,
  total: null,
  speed: null,
  version: null,
  path: null,
  error: null,
  ...over,
});

describe("overallProgress", () => {
  it("sums parallel downloads", () => {
    const o = overallProgress({
      "yt-dlp": p({ downloaded: 10 * MB, total: 40 * MB, speed: 2 * MB }),
      ffmpeg: p({ component: "ffmpeg", downloaded: 20 * MB, total: 60 * MB, speed: 3 * MB }),
    });
    expect(o.count).toBe(2);
    expect(o.active).toBe(2);
    expect(o.total).toBe(100 * MB);
    expect(o.percent).toBe(30);
    expect(o.speed).toBe(5 * MB);
    expect(o.eta).toBe(14);
  });

  it("counts finished and failed components", () => {
    const o = overallProgress({
      "yt-dlp": p({ stage: "done", downloaded: 40 * MB, total: 40 * MB, version: "2026.10.26" }),
      ffmpeg: p({ component: "ffmpeg", stage: "testing", downloaded: 60 * MB, total: 60 * MB }),
      deno: p({ component: "deno", stage: "error", error: "Download interrupted" }),
    });
    expect(o.done).toBe(1);
    expect(o.failed).toBe(1);
    expect(o.active).toBe(1);
    // the failed component (size unknown) doesn't block the overall percentage
    expect(o.total).toBe(100 * MB);
    expect(o.percent).toBe(100);
    expect(o.speed).toBeNull();
  });

  it("is indeterminate while a size is still unknown", () => {
    const o = overallProgress({
      "yt-dlp": p({ downloaded: 10 * MB, total: 40 * MB }),
      deno: p({ component: "deno", stage: "connecting" }),
    });
    expect(o.total).toBeNull();
    expect(o.percent).toBeNull();
  });

  it("handles an empty install", () => {
    const o = overallProgress({});
    expect(o.count).toBe(0);
    expect(o.percent).toBeNull();
  });
});

describe("per-component helpers", () => {
  it("computes percent only while downloading", () => {
    expect(percentOf(p({ downloaded: 5, total: 20 }))).toBe(25);
    expect(percentOf(p({ stage: "connecting" }))).toBeNull();
    expect(percentOf(p({ stage: "done" }))).toBe(100);
    expect(percentOf(undefined)).toBeNull();
  });

  it("describes each stage", () => {
    expect(stageText(p({ stage: "queued" }))).toBe("Waiting to start…");
    expect(stageText(p({ downloaded: 5 * MB, total: 20 * MB, speed: 2 * MB }))).toBe("5.0 MB of 20.0 MB · 2.0 MB/s");
    expect(stageText(p({ downloaded: 5 * MB }))).toBe("5.0 MB downloaded");
    expect(stageText(p({ stage: "done", version: "9.0.2" }))).toBe("Installed · version 9.0.2");
    expect(stageText(p({ stage: "error", error: "Boom" }))).toBe("Boom");
  });

  it("knows which stages are in progress", () => {
    expect(isInstalling(p({ stage: "testing" }))).toBe(true);
    expect(isInstalling(p({ stage: "done" }))).toBe(false);
    expect(isInstalling(undefined)).toBe(false);
  });
});
