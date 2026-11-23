import { useEffect, useRef, useState, type ReactNode } from "react";
import { describeError, getT, useT, type Messages } from "../i18n";
import { api, errorMessage } from "../lib/ipc";
import { formatBytes, formatEta, formatSpeed } from "../lib/format";
import { isInstalling, overallProgress, percentOf, stageText } from "../lib/install";
import type { ComponentId, ComponentStatus, InstallProgress, UpdateInfo } from "../lib/types";
import { useDeps } from "../stores/deps";
import { isActive, useQueue } from "../stores/queue";
import { Button, FormRow, Group, Icon, RingIcon, Spinner } from "./ui";

const INFO: Record<ComponentId, { name: string; icon: string }> = {
  "yt-dlp": { name: "yt-dlp", icon: "download" },
  ffmpeg: { name: "ffmpeg", icon: "film" },
  deno: { name: "Deno", icon: "gear" },
};

/** "a", "a and b", "a, b and c" in the active language. */
function nameList(ids: ComponentId[], t: Messages = getT()): string {
  const names = ids.map((id) => INFO[id].name);
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${t.setup.and} ${names[names.length - 1]}`;
}

const NBSP = " ";

// ---------------------------------------------------------------------------
// One component row: fixed height; only the ring and the text change.
// ---------------------------------------------------------------------------

function rowState(t: Messages, c: ComponentStatus, p: InstallProgress | undefined) {
  const k = t.components;
  const busy = isInstalling(p);
  const failed = p?.stage === "error";
  let status: string;
  if (p && (busy || failed || p.stage === "done")) status = stageText(p);
  else if (c.installed) status = `${k.ready}${c.version ? ` · ${c.version}` : ""}${c.managed ? "" : ` · ${k.systemCopy}`}`;
  else status = c.required ? k.notInstalled : `${k.notInstalled} · ${k.optional}`;
  return { busy, failed, ready: !busy && !failed && c.installed, status, percent: percentOf(p) };
}

function ComponentRow({ c, onRetry }: { c: ComponentStatus; onRetry?: (id: ComponentId) => void }) {
  const t = useT();
  const progress = useDeps((s) => s.progress[c.id]);
  const { busy, failed, ready, status, percent } = rowState(t, c, progress);
  const info = INFO[c.id];

  return (
    <li
      className="relative flex h-14 items-center gap-3 px-4 [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-15 [&+&]:before:border-t-[0.5px] [&+&]:before:border-separator"
      aria-busy={busy}
    >
      <RingIcon
        icon={failed ? "alert" : ready ? "check" : info.icon}
        active={busy}
        value={progress?.stage === "downloading" ? percent : null}
        filled={ready}
        muted={!busy && !failed && !ready}
        label={`${info.name}: ${status}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5">
          <span className="font-medium text-label">{info.name}</span>
          <span className="text-label-tertiary"> · {t.components.about[c.id]}</span>
        </p>
        <p
          className={`truncate text-xs leading-4 tabular-nums ${failed ? "text-accent-strong" : "text-label-secondary"}`}
          title={failed ? describeError(progress?.error ?? "", t) : (c.path ?? "")}
        >
          {status}
        </p>
      </div>
      {/* Fixed-width slot so the text column never resizes. */}
      <div className="flex w-14 shrink-0 justify-end">
        {busy && percent != null ? (
          <span className="text-xs tabular-nums text-label-secondary">{Math.floor(percent)}%</span>
        ) : failed && onRetry ? (
          <button
            type="button"
            onClick={() => onRetry(c.id)}
            className="text-xs font-medium text-accent hover:text-accent-strong hover:underline"
          >
            {t.common.retry}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export function ComponentList({ onRetry }: { onRetry?: (id: ComponentId) => void }) {
  const status = useDeps((s) => s.status);
  return (
    <ul>
      {(status ?? []).map((c) => (
        <ComponentRow key={c.id} c={c} onRetry={onRetry} />
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// First-run setup screen
// ---------------------------------------------------------------------------

export function SetupScreen() {
  const t = useT();
  const su = t.setup;
  const { status, installing, install, finishSetup, progress } = useDeps();
  const o = overallProgress(progress);
  const missing = status?.filter((c) => !c.installed) ?? [];
  const missingRequired = missing.some((c) => c.required);
  const failedIds = Object.values(progress)
    .filter((p): p is InstallProgress => p?.stage === "error")
    .map((p) => p.component);
  const failed = !installing && failedIds.length > 0;
  const allSet = !installing && status != null && missing.length === 0;
  const canContinue = !installing && !missingRequired;
  const startButton = useRef<HTMLButtonElement>(null);

  // Short success moment, then into the app (or click to go now).
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!allSet) return;
    startButton.current?.focus();
    setCountdown(3);
    const tick = setInterval(() => setCountdown((n) => (n == null ? n : n - 1)), 1000);
    return () => clearInterval(tick);
  }, [allSet]);
  useEffect(() => {
    if (countdown === 0) finishSetup();
  }, [countdown, finishSetup]);

  // Summary: two fixed lines plus a percentage slot.
  let title: string;
  let detail: string;
  if (allSet) {
    title = su.allSet;
    detail = su.allSetDetail;
  } else if (installing) {
    title = su.installingProgress(o.done, o.count);
    detail =
      [
        o.total ? t.common.of(formatBytes(o.downloaded), formatBytes(o.total)) : o.downloaded ? `${formatBytes(o.downloaded)}` : null,
        formatSpeed(o.speed),
        formatEta(o.eta),
      ]
        .filter(Boolean)
        .join(" · ") || su.connecting;
  } else if (failed) {
    title = su.readyCount(o.done, o.count);
    detail = su.couldntInstall(nameList(failedIds, t));
  } else {
    title = su.componentCount(status?.length ?? 3);
    detail = su.size;
  }
  let hint: ReactNode;
  if (allSet) hint = countdown != null && countdown > 0 ? su.openingIn(countdown) : su.opening;
  else if (installing) hint = su.keepOpen;
  else if (failed && canContinue)
    hint = (
      <button type="button" onClick={finishSetup} className="font-medium text-accent hover:text-accent-strong hover:underline">
        {su.continueWithout(nameList(missing.map((c) => c.id), t))}
      </button>
    );
  else if (failed) hint = su.checkConnection;
  else hint = su.takesMinute;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{su.title}</h1>
      <p className="mt-1.5 min-h-10 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{su.intro}</p>

      <section className="mt-6 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-100 px-4 dark:border-zinc-800" aria-live="polite">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-50">{title}</p>
            <p className={`truncate text-xs leading-4 tabular-nums ${failed ? "text-accent-strong" : "text-zinc-500 dark:text-zinc-400"}`}>
              {detail || NBSP}
            </p>
          </div>
          <span className="w-12 shrink-0 text-right text-lg font-semibold tabular-nums text-accent">
            {installing && o.percent != null ? `${Math.floor(o.percent)}%` : allSet ? <Icon name="check" className="ml-auto size-5" /> : NBSP}
          </span>
        </div>
        <ComponentList onRetry={installing ? undefined : (id) => void install([id])} />
      </section>

      <div className="mt-4 flex h-9 items-center justify-between gap-3">
        <div className="min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400">{hint}</div>
        {allSet ? (
          <Button ref={startButton} variant="primary" className="min-w-44" onClick={finishSetup}>
            {su.start}
          </Button>
        ) : (
          <Button
            variant="primary"
            className="min-w-44 tabular-nums"
            disabled={installing || missing.length === 0}
            onClick={() => void install(failed ? failedIds : undefined)}
          >
            {installing
              ? su.installingPercent(o.percent != null ? Math.floor(o.percent) : null)
              : failed
                ? failedIds.length === 1
                  ? su.retryOne(INFO[failedIds[0]].name)
                  : su.retryFailed
                : su.install}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings → Components
// ---------------------------------------------------------------------------

const ALL_COMPONENTS: ComponentId[] = ["yt-dlp", "ffmpeg", "deno"];

/** Components as a grouped section: the one current action sits in the header. */
export function ComponentsGroup() {
  const t = useT();
  const k = t.components;
  const { status, installing, install, error } = useDeps();
  const downloading = useQueue((s) => s.jobs.some(isActive));
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const missing = (status ?? []).filter((c) => !c.installed).map((c) => c.id);
  const ytdlp = status?.find((c) => c.id === "yt-dlp");
  const locked = installing || downloading;

  async function checkUpdate() {
    setChecking(true);
    setMessage(null);
    try {
      const u = await api.ytdlpCheckUpdate();
      setUpdate(u);
      setMessage(
        u.updateAvailable
          ? `${k.updateAvailable(u.latest, u.current)}${u.managed ? "" : ` ${k.systemInstalled}`}`
          : k.upToDate(u.latest),
      );
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  let action: ReactNode;
  if (missing.length > 0) {
    action = (
      <Button size="sm" variant="primary" disabled={locked} onClick={() => install(missing)}>
        {k.installMissing}
      </Button>
    );
  } else if (update?.updateAvailable) {
    action = (
      <Button
        size="sm"
        variant="primary"
        disabled={locked}
        onClick={async () => {
          if (await install(["yt-dlp"])) {
            setUpdate(null);
            setMessage(null);
          }
        }}
      >
        {ytdlp?.managed ? k.updateYtdlp : k.installManaged}
      </Button>
    );
  } else {
    action = (
      <Button size="sm" variant="plain" disabled={checking || installing} onClick={checkUpdate}>
        {checking ? (
          <>
            <Spinner className="size-3" /> {k.checking}
          </>
        ) : (
          k.checkUpdates
        )}
      </Button>
    );
  }

  // One line, always present, so messages never move the layout.
  const note =
    (!installing && error && describeError(error, t)) ||
    message ||
    (downloading ? k.lockedDownloading : k.updateTip);

  return (
    <Group
      header={k.header}
      accessory={action}
      footer={
        <p className="truncate" aria-live="polite" title={note}>
          {note}
        </p>
      }
    >
      <ComponentList onRetry={locked ? undefined : (id) => void install([id])} />
      <div className="border-t-[0.5px] border-separator">
        <FormRow label={k.reinstallAll} detail={k.reinstallHint}>
          <Button size="sm" disabled={locked} onClick={() => install(ALL_COMPONENTS)}>
            {installing ? (
              <>
                <Spinner className="size-3" /> {k.installing}
              </>
            ) : (
              k.reinstall
            )}

          </Button>
        </FormRow>
      </div>
    </Group>
  );
}
