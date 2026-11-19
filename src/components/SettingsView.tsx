import type { ReactNode } from "react";
import { heightLabel, STANDARD_HEIGHTS } from "../lib/format";
import { useSettings } from "../stores/settings";
import { ComponentsPanel } from "./Components";
import { pickFolder } from "./OptionsPanel";
import { Button, Card, Field, Icon, Segmented, Toggle, inputClass, selectClass } from "./ui";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

export function SettingsView() {
  const { settings, update } = useSettings();

  return (
    <div className="flex flex-col gap-4">
      <Section title="Downloads" description="Defaults for new downloads. You can still change them per download.">
        <Field label="Save to">
          <div className="flex min-w-0 items-center gap-2">
            <div className={`${inputClass} flex min-w-0 flex-1 items-center gap-2`}>
              <Icon name="folder" className="size-4 shrink-0 text-zinc-400" />
              <span className="truncate" title={settings.outputDir}>
                {settings.outputDir}
              </span>
            </div>
            <Button
              onClick={async () => {
                const dir = await pickFolder(settings.outputDir);
                if (dir) await update({ outputDir: dir });
              }}
            >
              Change…
            </Button>
          </div>
        </Field>

        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <Field label="Default type">
            <Segmented
              label="Default type"
              value={settings.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: "video", label: "Video" },
                { value: "audio", label: "Audio only" },
              ]}
            />
          </Field>
          <Field label="Video quality">
            <select
              className={selectClass}
              value={settings.maxHeight ?? "best"}
              onChange={(e) => update({ maxHeight: e.target.value === "best" ? null : Number(e.target.value) })}
            >
              <option value="best">Best available</option>
              {STANDARD_HEIGHTS.map((h) => (
                <option key={h} value={h}>
                  Up to {heightLabel(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Video format">
            <select
              className={selectClass}
              value={settings.videoContainer}
              onChange={(e) => update({ videoContainer: e.target.value as "mp4" | "mkv" })}
            >
              <option value="mp4">MP4</option>
              <option value="mkv">MKV</option>
            </select>
          </Field>
          <Field label="Audio format">
            <select
              className={selectClass}
              value={settings.audioFormat}
              onChange={(e) => update({ audioFormat: e.target.value as "mp3" | "m4a" })}
            >
              <option value="mp3">MP3</option>
              <option value="m4a">M4A</option>
            </select>
          </Field>
          <Field label="Simultaneous downloads">
            <select
              className={selectClass}
              value={settings.concurrency}
              onChange={(e) => update({ concurrency: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Toggle
            checked={settings.embedMetadata}
            onChange={(embedMetadata) => update({ embedMetadata })}
            label="Embed title, thumbnail & chapters"
          />
          <Toggle checked={settings.subtitles} onChange={(subtitles) => update({ subtitles })} label="Download subtitles" />
          <Toggle
            checked={settings.autoSubtitles}
            onChange={(autoSubtitles) => update({ autoSubtitles })}
            label="Include auto-generated"
            disabled={!settings.subtitles}
          />
          <input
            className={`${inputClass} w-40`}
            value={settings.subLangs}
            onChange={(e) => update({ subLangs: e.target.value })}
            placeholder="en.*,es"
            aria-label="Subtitle languages"
            disabled={!settings.subtitles}
          />
        </div>
      </Section>

      <Section
        title="Components"
        description="yt-dlp changes often as YouTube changes. If downloads start failing, updating it usually fixes them."
      >
        <ComponentsPanel />
      </Section>

      <Section title="About">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Grabbit is free, open-source software under the MIT License. It is built on{" "}
          <strong>yt-dlp</strong> (Unlicense), <strong>ffmpeg</strong> (LGPL/GPL) and <strong>Deno</strong> (MIT), which
          are downloaded separately from their official releases.
        </p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Only download content you have the right to. You are responsible for complying with the terms of service of
          the sites you use and with copyright law in your country.
        </p>
      </Section>
    </div>
  );
}
