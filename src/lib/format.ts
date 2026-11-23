import { getLocale, getT } from "../i18n";

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const num = new Intl.NumberFormat(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false });
  return `${num.format(value)} ${UNITS[unit]}`;
}

export function formatSpeed(bytesPerSecond: number | null | undefined): string {
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond)) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Seconds remaining → "12s left", "3m left", "1h 5m left" (in the active language). */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const eta = getT().format.eta;
  if (seconds < 60) return eta.seconds(Math.round(seconds));
  if (seconds < 3600) return eta.minutes(Math.round(seconds / 60));
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return eta.hours(h, m);
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleString(getLocale(), { dateStyle: "medium", timeStyle: "short" });
}

export function fileName(path: string | null | undefined): string {
  if (!path) return "";
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

/**
 * Pick the quality to preselect for a video: the user's preferred max height
 * if available, otherwise the best height below it, otherwise "best" (null).
 */
export function pickHeight(available: number[], preferred: number | null): number | null {
  if (preferred == null) return null;
  if (available.length === 0) return preferred;
  const fit = available.filter((h) => h <= preferred).sort((a, b) => b - a)[0];
  return fit ?? null;
}

export function heightLabel(h: number): string {
  if (h >= 4320) return `${h}p (8K)`;
  if (h >= 2160) return `${h}p (4K)`;
  if (h >= 1440) return `${h}p (2K)`;
  if (h >= 720) return `${h}p (HD)`;
  return `${h}p`;
}

/** Heights offered when the actual formats aren't known (playlists). */
export const STANDARD_HEIGHTS = [2160, 1440, 1080, 720, 480, 360];

/** Rough check that a string looks like a downloadable link. */
export function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+\.\S+/i.test(text.trim());
}
