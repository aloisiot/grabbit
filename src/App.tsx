import { useEffect, useState } from "react";
import { DownloadView } from "./components/DownloadView";
import { HistoryView } from "./components/HistoryView";
import { SettingsView } from "./components/SettingsView";
import { SetupScreen } from "./components/Components";
import { ErrorNote, Icon, Logo, Spinner } from "./components/ui";
import { errorMessage } from "./lib/ipc";
import { useDeps } from "./stores/deps";
import { isActive, useQueue } from "./stores/queue";
import { useSettings } from "./stores/settings";

type Tab = "download" | "history" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "download", label: "Download", icon: "download" },
  { id: "history", label: "History", icon: "clock" },
  { id: "settings", label: "Settings", icon: "gear" },
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
      <div className="flex h-full items-center justify-center text-zinc-400">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (setupVisible) return <SetupScreen />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white/80 px-5 py-2.5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80">
        <div className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-zinc-50">
          <Logo className="size-7" />
          Grabbit
        </div>
        <nav className="flex gap-1" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <Icon name={t.icon} />
              {t.label}
              {t.id === "download" && active > 0 && tab !== "download" && (
                <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white tabular-nums dark:text-zinc-950">{active}</span>
              )}
            </button>
          ))}
        </nav>
        {deps.some((c) => !c.installed) && (
          <button
            type="button"
            onClick={() => setTab("settings")}
            className="ml-auto text-xs text-accent-strong hover:underline"
          >
            Deno missing — some YouTube videos may fail
          </button>
        )}
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 py-5">
          {/* Keep the download view mounted so a half-filled form survives tab switches. */}
          <div hidden={tab !== "download"}>
            <DownloadView />
          </div>
          {tab === "history" && <HistoryView onRedownload={() => setTab("download")} />}
          {tab === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}
