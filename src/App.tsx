import { useEffect, useState } from "react";
import { DownloadView } from "./components/DownloadView";
import { HistoryView } from "./components/HistoryView";
import { SettingsView } from "./components/SettingsView";
import { SetupScreen } from "./components/Components";
import { Button, ErrorNote, Icon, Spinner } from "./components/ui";
import { errorMessage } from "./lib/ipc";
import { useDeps } from "./stores/deps";
import { isActive, useQueue } from "./stores/queue";
import { useSettings } from "./stores/settings";

type Tab = "download" | "history" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "download", label: "Download" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("download");
  const [bootError, setBootError] = useState<string | null>(null);
  const settingsLoaded = useSettings((s) => s.loaded);
  const deps = useDeps((s) => s.status);
  const setupVisible = useDeps((s) => s.setupVisible);
  const active = useQueue((s) => s.jobs.filter((j) => isActive(j) || j.status === "queued").length);

  useEffect(() => {
    Promise.all([useSettings.getState().init(), useDeps.getState().init(), useQueue.getState().init()]).catch((e) =>
      setBootError(errorMessage(e)),
    );
  }, []);

  if (bootError) {
    return (
      <div className="p-6">
        <ErrorNote>Grabbit couldn't start: {bootError}</ErrorNote>
      </div>
    );
  }
  if (!settingsLoaded || !deps) {
    return (
      <div className="flex h-full items-center justify-center text-label-tertiary">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (setupVisible) return <SetupScreen />;

  return (
    <div className="flex h-full flex-col">
      <header className="grid h-[52px] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 border-b-[0.5px] border-separator px-5 material-bar">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-[22px] items-center justify-center rounded-md bg-accent text-accent-on">
            <Icon name="download" className="size-3.5" />
          </span>
          Grabbit
        </div>
        <nav role="tablist" aria-label="Sections" className="inline-flex gap-0.5 rounded-lg bg-fill p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              onClick={() => setTab(t.id)}
              aria-selected={tab === t.id}
              className={`inline-flex h-6 items-center gap-1.5 rounded-md px-3.5 text-[13px] font-medium transition-colors focus-visible:focus-ring ${
                tab === t.id ? "bg-surface text-label elev-control" : "text-label-secondary hover:text-label"
              }`}
            >
              {t.label}
              {t.id === "download" && active > 0 && tab !== "download" && (
                <span className="min-w-4 rounded-full bg-accent px-1 text-[10px] leading-4 font-semibold text-accent-on tabular-nums">{active}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="flex justify-end">
          {deps.some((c) => !c.installed) && (
            <Button size="sm" variant="plain" onClick={() => setTab("settings")}>
              <Icon name="alert" className="size-3.5" /> Deno missing
            </Button>
          )}
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {/* Keep the download view mounted so a half-filled form survives tab switches. */}
        <div hidden={tab !== "download"} className="h-full">
          <DownloadView />
        </div>
        {tab !== "download" && (
          <div className="mx-auto max-w-3xl px-5 py-6">
            {tab === "history" && <HistoryView onRedownload={() => setTab("download")} />}
            {tab === "settings" && <SettingsView />}
          </div>
        )}
      </main>
    </div>
  );
}
