import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT, type Messages } from "../i18n";
import { api, errorMessage } from "../lib/ipc";
import { formatDuration, heightLabel, looksLikeUrl, pickHeight, STANDARD_HEIGHTS } from "../lib/format";
import type { DownloadOptions, PlaylistProbe, ProbeResult, VideoProbe } from "../lib/types";
import { useQueue } from "../stores/queue";
import { optionsFromSettings, useSettings } from "../stores/settings";
import { OptionsPanel, shortPath } from "./OptionsPanel";
import { QueueList } from "./QueueList";
import { Button, Checkbox, ErrorNote, Group, Icon, Notice, Spinner, Thumb } from "./ui";

export function DownloadView() {
  const t = useT();
  const d = t.download;
  const settings = useSettings((s) => s.settings);
  const hasJobs = useQueue((s) => s.jobs.length > 0);
  const [url, setUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [options, setOptions] = useState<DownloadOptions>(() => optionsFromSettings(settings));
  const [notice, setNotice] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const probeId = useRef(0);
  // The action bar is portalled here so it spans the window while the column stays narrow.
  const [barSlot, setBarSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  async function runProbe(target = url) {
    const link = target.trim();
    if (!link) return;
    if (!looksLikeUrl(link)) {
      setError(d.notALink);
      return;
    }
    const id = ++probeId.current;
    setProbing(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.probe(link);
      if (id !== probeId.current) return; // a newer probe superseded this one
      const base = optionsFromSettings(useSettings.getState().settings);
      setOptions(r.kind === "video" ? { ...base, maxHeight: pickHeight(r.heights, base.maxHeight) } : base);
      setResult(r);
    } catch (e) {
      if (id === probeId.current) setError(errorMessage(e));
    } finally {
      if (id === probeId.current) setProbing(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) {
        setUrl(text);
        void runProbe(text);
      }
    } catch {
      inputRef.current?.focus();
      setError(d.clipboardFailed);
    }
  }

  function reset(message: string) {
    probeId.current++;
    setResult(null);
    setUrl("");
    setNotice(message);
    inputRef.current?.focus();
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-5 pt-8 pb-8">
        <form
          className="flex h-12 items-center gap-3 rounded-[var(--radius-group)] bg-surface pr-1.5 pl-4 elev-group transition-shadow focus-within:focus-ring"
          onSubmit={(e) => {
            e.preventDefault();
            void runProbe();
          }}
        >
          <Icon name="link" className="size-4 shrink-0 text-label-secondary" />
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-sm text-label outline-none placeholder:text-label-tertiary"
            placeholder={d.placeholder}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text").trim();
              if (looksLikeUrl(text)) {
                e.preventDefault();
                setUrl(text);
                void runProbe(text);
              }
            }}
            spellCheck={false}
            autoComplete="off"
            aria-label={d.linkLabel}
          />
          <Button variant="ghost" onClick={pasteFromClipboard} title={d.pasteTitle}>
            <Icon name="clipboard" className="size-3.5" /> {d.paste}
          </Button>
          {/* Fetch is the primary action until there's something to download. */}
          <Button type="submit" variant={result ? "secondary" : "primary"} className="min-w-18" disabled={probing || !url.trim()}>
            {probing ? <Spinner className="size-3.5" /> : d.fetch}
          </Button>
        </form>

        {notice && <Notice>{notice}</Notice>}
        {error && <ErrorNote>{error}</ErrorNote>}
        {probing && (
          <div className="flex items-center gap-2.5 px-1 text-[13px] text-label-secondary">
            <Spinner className="size-3.5" /> {d.reading}
          </div>
        )}

        {result?.kind === "video" && (
          <VideoSection
            video={result}
            options={options}
            onOptions={setOptions}
            barSlot={barSlot}
            onDownload={async () => {
              await api.enqueue([
                { url: result.url, videoId: result.id, title: result.title, thumbnail: result.thumbnail, options, playlist: null },
              ]);
              reset(d.addedOne(result.title));
            }}
          />
        )}

        {result?.kind === "playlist" && (
          <PlaylistSection
            playlist={result}
            options={options}
            onOptions={setOptions}
            barSlot={barSlot}
            onDownload={async (indices) => {
              const items = result.entries
                .filter((e) => indices.has(e.index))
                .map((e) => ({
                  url: e.url,
                  videoId: e.id,
                  title: e.title,
                  thumbnail: e.thumbnail,
                  options,
                  playlist: { title: result.title, index: e.index },
                }));
              await api.enqueue(items);
              reset(d.addedMany(items.length, result.title));
            }}
          />
        )}

        {!result && !probing && !error && !hasJobs && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong">
              <Icon name="download" className="size-6" />
            </span>
            <div>
              <p className="text-[15px] font-semibold">{d.emptyTitle}</p>
              <p className="mt-1 text-[13px] text-label-secondary">{d.emptyBody}</p>
            </div>
          </div>
        )}

        <QueueList />
      </div>
      <div ref={setBarSlot} className="sticky bottom-0 empty:hidden" />
    </div>
  );
}

/** Bottom bar with the page's one primary action and a summary of exactly what it will do. */
function ActionBar({ slot, title, detail, children }: { slot: HTMLElement | null; title: ReactNode; detail: ReactNode; children: ReactNode }) {
  if (!slot) return null;
  return createPortal(
    <div className="flex h-15 items-center justify-between gap-4 border-t-[0.5px] border-separator px-5 material-bar">
      <div className="flex min-w-0 flex-col">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="truncate text-xs text-label-secondary">{detail}</span>
      </div>
      {children}
    </div>,
    slot,
  );
}

function summary(t: Messages, options: DownloadOptions, folder: string): string {
  const parts =
    options.mode === "audio"
      ? [t.common.audio, options.audioFormat.toUpperCase()]
      : [t.common.video, options.maxHeight ? heightLabel(options.maxHeight) : t.common.bestQuality, options.videoContainer.toUpperCase()];
  return [...parts, folder].join(" · ");
}

function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
}

function VideoSection({
  video,
  options,
  onOptions,
  onDownload,
  barSlot,
}: {
  video: VideoProbe;
  options: DownloadOptions;
  onOptions: (o: DownloadOptions) => void;
  onDownload: () => Promise<void>;
  barSlot: HTMLElement | null;
}) {
  const t = useT();
  const [busy, run] = useBusy();
  return (
    <>
      <div className="flex items-center gap-4">
        <Thumb src={video.thumbnail} alt="" className="aspect-video w-36 !rounded-lg" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-xl leading-[25px] font-semibold tracking-tight">{video.title}</h2>
          <p className="mt-0.5 text-[13px] text-label-secondary">
            {[video.uploader, formatDuration(video.duration), video.heights[0] && t.download.upTo(video.heights[0])].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <OptionsPanel options={options} onChange={onOptions} heights={video.heights} subtitleLangs={video.subtitleLangs} />
      <ActionBar slot={barSlot} title={t.download.oneVideo} detail={summary(t, options, shortPath(options.outputDir))}>
        <Button variant="primary" size="lg" disabled={busy} onClick={() => run(onDownload)}>
          <Icon name="download" /> {t.download.download}
        </Button>
      </ActionBar>
    </>
  );
}

function PlaylistSection({
  playlist,
  options,
  onOptions,
  onDownload,
  barSlot,
}: {
  playlist: PlaylistProbe;
  options: DownloadOptions;
  onOptions: (o: DownloadOptions) => void;
  onDownload: (indices: Set<number>) => Promise<void>;
  barSlot: HTMLElement | null;
}) {
  const t = useT();
  const d = t.download;
  const [selected, setSelected] = useState<Set<number>>(() => new Set(playlist.entries.map((e) => e.index)));
  const [filter, setFilter] = useState("");
  const [busy, run] = useBusy();
  const visible = playlist.entries.filter((e) => e.title.toLowerCase().includes(filter.trim().toLowerCase()));
  const total = playlist.entries.length;
  const allSelected = selected.size === total;

  const toggle = (index: number) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <>
      <div className="flex items-center gap-4">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent-strong">
          <Icon name="list" className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-xl leading-[25px] font-semibold tracking-tight">{playlist.title}</h2>
          <p className="mt-0.5 text-[13px] text-label-secondary">
            {[playlist.uploader, d.videos(total), d.playlistFolder].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <ErrorNote>{d.playlistEmpty}</ErrorNote>
      ) : (
        <Group
          header={<span className="tabular-nums">{d.selected(selected.size, total)}</span>}
          accessory={
            <div className="flex items-center gap-2 font-normal">
              <label className="flex h-6 w-40 items-center gap-1.5 rounded-md bg-fill px-2 transition-colors focus-within:bg-surface focus-within:focus-ring">
                <Icon name="search" className="size-3.5 shrink-0 text-label-tertiary" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-xs text-label outline-none placeholder:text-label-tertiary"
                  placeholder={d.filter}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label={d.filterLabel}
                />
              </label>
              <Button
                size="sm"
                variant="plain"
                onClick={() => setSelected(allSelected ? new Set() : new Set(playlist.entries.map((e) => e.index)))}
              >
                {allSelected ? d.selectNone : d.selectAll}
              </Button>
            </div>
          }
          className="max-h-[316px] overflow-y-auto"
        >
          <ul>
            {visible.map((e) => {
              const on = selected.has(e.index);
              return (
                <li
                  key={`${e.index}-${e.id}`}
                  className="relative [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-[144px] [&+&]:before:border-t-[0.5px] [&+&]:before:border-separator"
                >
                  <label className="flex h-[52px] items-center gap-3 px-4 transition-colors hover:bg-accent-faint">
                    <Checkbox checked={on} onChange={() => toggle(e.index)} />
                    <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-label-tertiary">{e.index}</span>
                    <Thumb src={e.thumbnail} alt="" className={`aspect-video w-14 transition-opacity ${on ? "" : "opacity-50"}`} />
                    <span className={`min-w-0 flex-1 truncate text-sm ${on ? "" : "text-label-secondary"}`}>{e.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-label-secondary">{formatDuration(e.duration)}</span>
                  </label>
                </li>
              );
            })}
            {visible.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-label-secondary">{d.noMatch(filter)}</li>}
          </ul>
        </Group>
      )}

      <OptionsPanel options={options} onChange={onOptions} heights={STANDARD_HEIGHTS} />
      <ActionBar
        slot={barSlot}
        title={selected.size === 0 ? d.nothingSelected : d.items(selected.size)}
        detail={summary(t, options, `${shortPath(options.outputDir)}/${playlist.title}`)}
      >
        <Button variant="primary" size="lg" disabled={busy || selected.size === 0} onClick={() => run(() => onDownload(selected))}>
          <Icon name="download" /> {selected.size > 0 ? d.downloadN(selected.size) : d.download}

        </Button>
      </ActionBar>
    </>
  );
}
