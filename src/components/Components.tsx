import { useState } from "react";
import { api, errorMessage } from "../lib/ipc";
import { formatBytes } from "../lib/format";
import type { ComponentId, ComponentStatus, UpdateInfo } from "../lib/types";
import { missingRequired, useDeps } from "../stores/deps";
import { useQueue, isActive } from "../stores/queue";
import { Button, Card, ErrorNote, Icon, ProgressBar, Spinner } from "./ui";

const INFO: Record<ComponentId, { name: string; about: string }> = {
  "yt-dlp": { name: "yt-dlp", about: "The download engine." },
  ffmpeg: { name: "ffmpeg", about: "Merges video and audio, converts to MP3, embeds metadata." },
  deno: { name: "Deno", about: "JavaScript runtime yt-dlp needs for full YouTube support." },
};

function ComponentRow({ c }: { c: ComponentStatus }) {
  const progress = useDeps((s) => s.progress[c.id]);
  const installing = useDeps((s) => s.installing);
  const busy = installing && progress && progress.stage !== "done" && progress.stage !== "error";

  let line: string;
  if (busy && progress?.stage === "downloading") {
    const part = progress.parts > 1 ? ` (file ${progress.part} of ${progress.parts})` : "";
    line = `Downloading ${formatBytes(progress.downloaded)}${progress.total ? ` of ${formatBytes(progress.total)}` : ""}${part}`;
  } else if (busy) {
    line = "Unpacking…";
  } else if (c.installed) {
    line = `${c.version ? `Version ${c.version}` : "Installed"} · ${c.managed ? "managed by Grabbit" : "system copy"}`;
  } else {
    line = c.required ? "Not installed — required" : "Not installed — recommended";
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
            c.installed ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800"
          }`}
        >
          {busy ? <Spinner /> : <Icon name={c.installed ? "check" : "download"} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {INFO[c.id].name} <span className="font-normal text-zinc-500 dark:text-zinc-400">— {INFO[c.id].about}</span>
          </p>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400" title={c.path ?? ""}>
            {line}
          </p>
        </div>
      </div>
      {busy && progress?.stage === "downloading" && (
        <div className="pl-11">
          <ProgressBar value={progress.total ? (progress.downloaded / progress.total) * 100 : null} />
        </div>
      )}
      {progress?.stage === "error" && progress.error && (
        <div className="pl-11">
          <ErrorNote>{progress.error}</ErrorNote>
        </div>
      )}
    </li>
  );
}

export function ComponentList() {
  const status = useDeps((s) => s.status);
  if (!status) return <Spinner />;
  return (
    <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800">
      {status.map((c) => (
        <ComponentRow key={c.id} c={c} />
      ))}
    </ul>
  );
}

/** First-run screen shown until yt-dlp and ffmpeg are available. */
export function SetupScreen() {
  const { status, installing, install } = useDeps();
  const missing = status?.filter((c) => !c.installed) ?? [];

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Welcome to Grabbit</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Grabbit is a front-end for the open-source tools below. They're downloaded once from their official
          release pages (checksums verified) and kept in Grabbit's own folder — nothing is installed system-wide.
        </p>
      </div>
      <Card>
        <ComponentList />
      </Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">About 150 MB in total.</p>
        <Button variant="primary" disabled={installing || missing.length === 0} onClick={() => install()}>
          {installing ? <><Spinner /> Installing…</> : missingRequired(status) ? "Install components" : "Install Deno"}
        </Button>
      </div>
    </div>
  );
}

/** Components section of Settings: versions, reinstall, yt-dlp update check. */
export function ComponentsPanel() {
  const { status, installing, install, error } = useDeps();
  const downloading = useQueue((s) => s.jobs.some(isActive));
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const missing = (status ?? []).filter((c) => !c.installed).map((c) => c.id);
  const ytdlp = status?.find((c) => c.id === "yt-dlp");

  async function checkUpdate() {
    setChecking(true);
    setCheckError(null);
    try {
      setUpdate(await api.ytdlpCheckUpdate());
    } catch (e) {
      setCheckError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ComponentList />
      {error && <ErrorNote>{error}</ErrorNote>}
      {checkError && <ErrorNote>{checkError}</ErrorNote>}
      {update && (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {update.updateAvailable
            ? `yt-dlp ${update.latest} is available (you have ${update.current ?? "none"}).`
            : `yt-dlp is up to date (${update.latest}).`}
          {update.updateAvailable && !update.managed && " Your copy is system-installed — update it with your package manager, or install a managed copy below."}
        </p>
      )}
      {downloading && <p className="text-xs text-zinc-500">Components can be updated once active downloads finish.</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={checkUpdate} disabled={checking}>
          {checking ? <Spinner /> : <Icon name="retry" />} Check for yt-dlp update
        </Button>
        {update?.updateAvailable && (
          <Button
            variant="primary"
            disabled={installing || downloading}
            onClick={async () => {
              if (await install(["yt-dlp"])) setUpdate(null);
            }}
          >
            {ytdlp?.managed ? "Update yt-dlp" : "Install managed yt-dlp"}
          </Button>
        )}
        {missing.length > 0 && (
          <Button variant="primary" disabled={installing || downloading} onClick={() => install(missing)}>
            Install missing
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={installing || downloading}
          onClick={() => install(["yt-dlp", "ffmpeg", "deno"])}
          title="Download fresh copies of all components"
        >
          Reinstall all
        </Button>
      </div>
    </div>
  );
}
