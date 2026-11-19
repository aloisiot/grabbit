import type { ButtonHTMLAttributes, ComponentPropsWithRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong active:bg-accent-strong disabled:bg-accent/50 shadow-sm dark:text-zinc-950",
  secondary:
    "bg-white text-zinc-800 ring-1 ring-zinc-300 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-700",
  ghost: "text-zinc-600 hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-zinc-800",
  danger: "text-accent-strong hover:bg-accent-soft",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ComponentPropsWithRef<"button"> & { variant?: Variant; size?: "sm" | "md" }) {
  const sizing = size === "sm" ? "h-7 px-2.5 text-xs gap-1.5" : "h-9 px-3.5 text-sm gap-2";
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${sizing} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  children,
  variant = "ghost",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: Variant }) {
  return (
    <Button variant={variant} size="sm" aria-label={label} title={label} className="w-7 !px-0" {...props}>
      {children}
    </Button>
  );
}

/** Thin bar; `tone="soft"` (lighter accent) marks a secondary phase such as post-processing. */
export function ProgressBar({ value, indeterminate, tone = "accent" }: { value: number | null; indeterminate?: boolean; tone?: "accent" | "soft" }) {
  const color = tone === "soft" ? "bg-accent/45" : "bg-accent";
  return (
    <div className="relative h-1 w-full overflow-hidden rounded-full bg-accent-soft">
      {indeterminate || value == null ? (
        <div className={`absolute inset-y-0 left-0 w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full will-change-transform ${color}`} />
      ) : (
        <div className={`h-full rounded-full transition-[width] duration-300 ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      )}
    </div>
  );
}

export function Thumb({ src, alt, className = "" }: { src: string | null | undefined; alt: string; className?: string }) {
  return src ? (
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className={`shrink-0 rounded-md bg-zinc-200 object-cover dark:bg-zinc-800 ${className}`} />
  ) : (
    <div className={`flex shrink-0 items-center justify-center rounded-md bg-zinc-200 text-zinc-400 dark:bg-zinc-800 ${className}`}>
      <Icon name="film" />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-zinc-200/70 p-0.5 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors ${
            value === o.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>}
    </label>
  );
}

export const selectClass =
  "h-9 rounded-lg bg-white px-2.5 text-sm text-zinc-900 ring-1 ring-zinc-300 focus:outline-2 focus:outline-accent dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700";

export const inputClass =
  "h-9 rounded-lg bg-white px-3 text-sm text-zinc-900 ring-1 ring-zinc-300 placeholder:text-zinc-400 focus:outline-2 focus:outline-accent dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700";

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="size-4 rounded accent-accent"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-zinc-700 dark:text-zinc-200">{label}</span>
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800 ${className}`}>
      {children}
    </section>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-accent-faint px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">
      <Icon name="alert" className="mt-0.5 size-4 shrink-0 text-accent-strong" />
      <div className="min-w-0 whitespace-pre-line">{children}</div>
    </div>
  );
}

const PATHS: Record<string, string> = {
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  x: "M6 6l12 12M18 6 6 18",
  retry: "M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4",
  play: "M8 5.5v13l11-6.5-11-6.5Z",
  trash: "M5 7h14M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  check: "M5 12.5 10 17l9-10",
  alert: "M12 8v5m0 3.5v.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  film: "M4 5h16v14H4zM8 5v14M16 5v14M4 9h4m8 0h4M4 15h4m8 0h4",
  clipboard: "M9 4h6v3H9zM8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  external: "M14 4h6v6m0-6L10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
};

export function Icon({ name, className = "size-4" }: { name: keyof typeof PATHS | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * An icon inside a small progress ring.
 *  - `value` 0–100: determinate arc
 *  - `value` null + `active`: spinning arc
 *  - `filled`: solid accent disc (finished)
 * Fixed size, so state changes never move the layout.
 */
export function RingIcon({
  icon,
  value = null,
  active = false,
  filled = false,
  muted = false,
  size = 32,
  label,
}: {
  icon: string;
  value?: number | null;
  active?: boolean;
  filled?: boolean;
  muted?: boolean;
  size?: number;
  label?: string;
}) {
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const determinate = active && value != null;
  const arc = determinate ? Math.max(0.02, Math.min(1, value / 100)) : 0.25;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role={active ? "progressbar" : undefined}
      aria-label={label}
      aria-valuenow={determinate ? Math.round(value) : undefined}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
    >
      <span
        className={`absolute rounded-full transition-colors duration-300 ${
          filled ? "bg-accent" : muted ? "bg-zinc-100 dark:bg-zinc-800" : "bg-accent-faint"
        }`}
        style={{ inset: stroke + 1 }}
      />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={`transition-colors duration-300 ${active ? "stroke-accent-soft" : "stroke-transparent"}`}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - arc)}
          className={`stroke-accent transition-[stroke-dashoffset,opacity] duration-300 ${active ? "opacity-100" : "opacity-0"} ${
            active && !determinate ? "origin-center animate-spin" : ""
          }`}
        />
      </svg>
      <Icon
        name={icon}
        className={`relative size-3.5 transition-colors duration-300 ${
          filled ? "text-white dark:text-zinc-950" : muted ? "text-zinc-400" : "text-accent-strong"
        }`}
      />
    </span>
  );
}

/** The Grabbit mark (same geometry as src-tauri/icons/app-icon.svg), themed with the accent. */
export function Logo({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="100 100 824 824" className={className} aria-hidden="true">
      <rect x="100" y="100" width="824" height="824" rx="186" className="fill-accent" />
      <g fill="#fff">
        <rect x="404" y="206" width="100" height="320" rx="50" transform="rotate(-9 452 520)" />
        <rect x="520" y="206" width="100" height="320" rx="50" transform="rotate(9 572 520)" />
        <circle cx="512" cy="622" r="186" />
      </g>
      <g fill="none" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round" className="stroke-accent">
        <path d="M512 548 V704" />
        <path d="M450 646 L512 708 L574 646" />
      </g>
    </svg>
  );
}
