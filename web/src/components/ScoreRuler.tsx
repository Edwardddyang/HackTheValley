// RentSafeTO score against the city median: a level badge (text + shape + colour) and a 0-100 ruler.

export type ScoreLevel = "at-or-above" | "below" | "well-below";

export function scoreLevel(score: number, median: number): ScoreLevel {
  if (score >= median) return "at-or-above";
  if (score >= median - 10) return "below";
  return "well-below";
}

export const LEVEL_TEXT: Record<ScoreLevel, string> = {
  "at-or-above": "At or above the city median",
  below: "Below the city median",
  "well-below": "Well below the city median",
};

const LEVEL_COLOR: Record<ScoreLevel, { fg: string; tint: string }> = {
  "at-or-above": { fg: "var(--moss)", tint: "var(--moss-tint)" },
  below: { fg: "var(--amber)", tint: "var(--amber-tint)" },
  "well-below": { fg: "var(--brick)", tint: "var(--brick-tint)" },
};

export function LevelBadge({ level }: { level: ScoreLevel }) {
  const c = LEVEL_COLOR[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[15px] font-semibold"
      style={{ color: c.fg, backgroundColor: c.tint }}>
      <LevelIcon level={level} />
      {LEVEL_TEXT[level]}
    </span>
  );
}

/** Shape differs per level so the badge reads without colour: check, minus, down-arrow. */
function LevelIcon({ level }: { level: ScoreLevel }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {level === "at-or-above" && (
        <path d="M4.8 8.2 7 10.4l4.3-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {level === "below" && <path d="M4.8 8h6.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
      {level === "well-below" && (
        <path d="M8 4.4v6.4M5.4 8.4 8 11l2.6-2.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * A 0–100 measuring rule: this building's score as a needle, the city median as a dashed post.
 * Purely visual (aria-hidden); the same facts are written out in text next to it.
 */
export function ScoreRuler({ score, median }: { score: number; median: number }) {
  const c = LEVEL_COLOR[scoreLevel(score, median)];
  const s = Math.max(0, Math.min(100, score));
  const m = Math.max(0, Math.min(100, median));
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);
  // Keep the median label inside the ruler when the median sits near the left edge.
  const medianLabelLeft = m < 30;

  return (
    <div aria-hidden="true" className="relative mx-3 mt-2 select-none pt-11 pb-12">
      <div className="absolute left-0 top-11 h-6 rounded-l-sm" style={{ width: `${s}%`, backgroundColor: c.tint }} />
      <div className="relative h-6 border-b-[3px] border-ink">
        {ticks.map((t) => (
          <span key={t} className="absolute bottom-0 w-px bg-ink" style={{ left: `${t}%`, height: t % 50 === 0 ? "100%" : "50%" }} />
        ))}
        {ticks.map((t) => (
          <span key={`l${t}`}
            className={`num absolute top-full mt-1 -translate-x-1/2 text-xs text-ink-2 ${t % 50 === 0 ? "" : "hidden sm:block"}`}
            style={{ left: `${t}%` }}>
            {t}
          </span>
        ))}
      </div>
      <div className="absolute bottom-3 top-6 border-l-2 border-dashed border-ink-2" style={{ left: `${m}%` }} />
      <span className={`absolute bottom-0 whitespace-nowrap text-[13px] font-semibold text-ink-2 ${medianLabelLeft ? "pl-1.5" : "-translate-x-full pr-1.5"}`}
        style={{ left: `${m}%` }}>
        City median {median}
      </span>
      <div className="ruler-marker absolute top-0 -translate-x-1/2" style={{ left: `${s}%` }}>
        <span className="plate num block px-1.5 text-center text-[1.5rem] font-bold leading-none" style={{ color: c.fg }}>
          {score}
        </span>
        <span className="mx-auto mt-1 block h-[2.35rem] w-1 rounded-full" style={{ backgroundColor: c.fg }} />
      </div>
    </div>
  );
}
