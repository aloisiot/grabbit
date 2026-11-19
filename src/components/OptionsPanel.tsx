import { open } from "@tauri-apps/plugin-dialog";
import { heightLabel } from "../lib/format";
import type { DownloadOptions } from "../lib/types";
import { Button, Field, Icon, Segmented, Toggle, inputClass, selectClass } from "./ui";

export async function pickFolder(current: string): Promise<string | null> {
  const dir = await open({ directory: true, defaultPath: current || undefined, title: "Choose download folder" });
  return typeof dir === "string" ? dir : null;
}

export function OptionsPanel({
  options,
  onChange,
  heights,
  subtitleLangs,
}: {
  options: DownloadOptions;
  onChange: (o: DownloadOptions) => void;
  /** Heights to offer in the quality menu, highest first. */
  heights: number[];
  /** Languages with real subtitles, when known (single video). */
  subtitleLangs?: string[];
}) {
  const set = (patch: Partial<DownloadOptions>) => onChange({ ...options, ...patch });
  const video = options.mode === "video";

  // Make sure the current choice is always selectable.
  const offered = [...new Set([...heights, ...(options.maxHeight ? [options.maxHeight] : [])])].sort((a, b) => b - a);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <Field label="Download">
          <Segmented
            label="Download type"
            value={options.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: "video", label: <><Icon name="film" /> Video</> },
              { value: "audio", label: <><Icon name="music" /> Audio only</> },
            ]}
          />
        </Field>

        {video ? (
          <>
            <Field label="Quality">
              <select
                className={selectClass}
                value={options.maxHeight ?? "best"}
                onChange={(e) => set({ maxHeight: e.target.value === "best" ? null : Number(e.target.value) })}
              >
                <option value="best">Best available</option>
                {offered.map((h) => (
                  <option key={h} value={h}>
                    {heightLabel(h)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Format">
              <select
                className={selectClass}
                value={options.videoContainer}
                onChange={(e) => set({ videoContainer: e.target.value as DownloadOptions["videoContainer"] })}
              >
                <option value="mp4">MP4 — plays everywhere</option>
                <option value="mkv">MKV — best quality codecs</option>
              </select>
            </Field>
          </>
        ) : (
          <Field label="Format">
            <select
              className={selectClass}
              value={options.audioFormat}
              onChange={(e) => set({ audioFormat: e.target.value as DownloadOptions["audioFormat"] })}
            >
              <option value="mp3">MP3 — most compatible</option>
              <option value="m4a">M4A (AAC) — no re-encoding</option>
            </select>
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Toggle
          checked={options.embedMetadata}
          onChange={(embedMetadata) => set({ embedMetadata })}
          label="Embed title, thumbnail & chapters"
        />
        {video && (
          <Toggle checked={options.subtitles} onChange={(subtitles) => set({ subtitles })} label="Subtitles" />
        )}
        {video && options.subtitles && (
          <>
            <input
              className={`${inputClass} w-36`}
              value={options.subLangs}
              onChange={(e) => set({ subLangs: e.target.value })}
              placeholder="en.*,es"
              aria-label="Subtitle languages"
              title="Comma-separated language codes. Wildcards allowed, e.g. en.* matches en-US and en-GB."
            />
            <Toggle
              checked={options.autoSubtitles}
              onChange={(autoSubtitles) => set({ autoSubtitles })}
              label="Include auto-generated"
            />
          </>
        )}
      </div>
      {video && options.subtitles && subtitleLangs && (
        <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {subtitleLangs.length > 0
            ? `Subtitles available: ${subtitleLangs.slice(0, 12).join(", ")}${subtitleLangs.length > 12 ? "…" : ""}`
            : "This video has no uploaded subtitles. Turn on auto-generated to get YouTube's automatic captions."}
        </p>
      )}

      <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
        <Icon name="folder" className="size-4 shrink-0" />
        <span className="min-w-0 truncate" title={options.outputDir}>
          {options.outputDir}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const dir = await pickFolder(options.outputDir);
            if (dir) set({ outputDir: dir });
          }}
        >
          Change…
        </Button>
      </div>
    </div>
  );
}
