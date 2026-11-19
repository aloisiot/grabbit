// Pure helpers for component-install progress (unit-tested).
import { formatBytes, formatSpeed } from "./format";
import type { ComponentId, InstallProgress, InstallStage } from "./types";

export const ACTIVE_STAGES: InstallStage[] = ["queued", "connecting", "downloading", "extracting", "testing"];

export function isInstalling(p: InstallProgress | undefined): boolean {
  return !!p && ACTIVE_STAGES.includes(p.stage);
}

export function percentOf(p: InstallProgress | undefined): number | null {
  if (!p) return null;
  if (p.stage === "done") return 100;
  if (p.stage !== "downloading" || !p.total) return null;
  return Math.min(100, (p.downloaded / p.total) * 100);
}

/** One line describing where a component's install is at. */
export function stageText(p: InstallProgress): string {
  switch (p.stage) {
    case "queued":
      return "Waiting to start…";
    case "connecting":
      return "Connecting…";
    case "downloading":
      return [
        p.total ? `${formatBytes(p.downloaded)} of ${formatBytes(p.total)}` : `${formatBytes(p.downloaded)} downloaded`,
        formatSpeed(p.speed),
      ]
        .filter(Boolean)
        .join(" · ");
    case "extracting":
      return "Checksum verified · unpacking…";
    case "testing":
      return "Checking that it runs (can take a few seconds)…";
    case "done":
      return p.version ? `Installed · version ${p.version}` : "Installed";
    case "error":
      return p.error ?? "Failed";
  }
}

/** Combined progress of every component in `progress`. */
export function overallProgress(progress: Partial<Record<ComponentId, InstallProgress>>) {
  const items = Object.values(progress).filter((p): p is InstallProgress => !!p);
  // Failed components drop out of the byte totals so the rest keeps a percentage.
  const counted = items.filter((p) => p.stage !== "error");
  const downloaded = counted.reduce((n, p) => n + p.downloaded, 0);
  // Finished components count what they actually downloaded.
  const totals = counted.map((p) => (p.stage === "done" && p.downloaded > 0 ? p.downloaded : p.total));
  const known = counted.length > 0 && totals.every((t) => t != null && t > 0);
  const total = known ? totals.reduce<number>((n, t) => n + (t ?? 0), 0) : null;
  const speed = items.reduce((n, p) => n + (p.stage === "downloading" && p.speed ? p.speed : 0), 0);
  return {
    count: items.length,
    done: items.filter((p) => p.stage === "done").length,
    failed: items.filter((p) => p.stage === "error").length,
    active: items.filter(isInstalling).length,
    downloaded,
    total,
    percent: total ? Math.min(100, (downloaded / total) * 100) : null,
    speed: speed > 0 ? speed : null,
    eta: total && speed > 0 ? Math.max(0, (total - downloaded) / speed) : null,
  };
}
