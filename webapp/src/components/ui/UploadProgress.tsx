/**
 * The one progress bar every upload surface uses.
 *
 * Uploads here are audio files — tens of megabytes over a home connection —
 * so a spinner says "something is happening" and nothing else. This says how
 * far along the transfer is, which file it is on, and what step of a save it
 * belongs to.
 *
 * `percent` is clamped, so a caller can hand over a raw byte ratio without
 * sanitising it. `indeterminate` covers the case the browser gives us no
 * total to divide by (a streamed body, a proxy that strips Content-Length):
 * the bar animates instead of sitting at 0%, and no misleading number is
 * shown.
 */
export interface UploadProgressProps {
  /** What is happening right now, e.g. `Uploading 2 of 5 — kick.wav`. */
  label: string;
  /** 0-100. Ignored when `indeterminate`. */
  percent: number;
  /** Optional second line: sizes, counts, a warning. */
  detail?: string;
  /** No total to measure against — animate rather than claim a number. */
  indeterminate?: boolean;
  /** daisyUI progress colour, to match the surrounding surface. */
  color?: "primary" | "secondary" | "accent";
  className?: string;
}

/**
 * Written out rather than interpolated: Tailwind only ships classes it can
 * find as literal strings in the source, so `progress-${color}` would build
 * to a bar with no colour.
 */
const COLOR_CLASS: Record<NonNullable<UploadProgressProps["color"]>, string> = {
  primary: "progress-primary",
  secondary: "progress-secondary",
  accent: "progress-accent",
};

export const UploadProgress = ({
  label,
  percent,
  detail,
  indeterminate = false,
  color = "primary",
  className = "",
}: UploadProgressProps) => {
  const value = Math.min(100, Math.max(0, Math.round(percent || 0)));

  return (
    <div className={`w-full space-y-1 ${className}`} data-testid="upload-progress">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate opacity-70">{label}</span>
        {!indeterminate && (
          <span className="font-mono opacity-50 shrink-0">{value}%</span>
        )}
      </div>
      <progress
        className={`progress ${COLOR_CLASS[color]} w-full h-1.5`}
        aria-label={label}
        {...(indeterminate ? {} : { value, max: 100 })}
      />
      {detail && <div className="text-[11px] opacity-50 truncate">{detail}</div>}
    </div>
  );
};

export default UploadProgress;
