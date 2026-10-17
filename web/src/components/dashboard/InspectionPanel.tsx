import { Cite } from "@/components/Cite";
import type { Brief, RentSafeStats } from "@/lib/brief";
import { date, month, num, titleCase } from "@/lib/format";

import { CompareBar, DashboardPanel, SCORE_LABEL, SCORE_RULE, SourceNote, StatusTag, Unavailable, rate } from "./DashboardPanel";

// Layout from feature/frontend's InspectionPanel / InspectionCard; data from bb_brief.
export default function InspectionPanel({ brief, stats }: { brief: Brief; stats: RentSafeStats | null }) {
  const b = brief.building;
  if (!b.in_rentsafe) {
    return (
      <DashboardPanel id="inspection" title="RentSafeTO inspection" subtitle="City evaluation of common areas, exterior and maintenance records.">
        <Unavailable>No RentSafeTO evaluation is on record for this exact address. RentSafeTO only covers apartment buildings with 3+ storeys and 10+ units, and missing data does not establish a building&apos;s condition. Evaluated buildings nearby are listed further down.</Unavailable>
      </DashboardPanel>
    );
  }
  const e = b.latest_evaluation;
  const score = e.score;
  const median = stats?.median_score ?? null;
  // The median covers 2023+ scoring only; item scale 3 means this evaluation uses it (pre-2023 was 1-5).
  const comparable = e.item_scale_max === 3 && median != null;
  const status = comparable ? rate(score, median, SCORE_RULE) : null;
  return (
    <DashboardPanel id="inspection" title="RentSafeTO inspection" subtitle="An inspection snapshot, with the lowest-scoring categories and past evaluations.">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-medium text-slate-500">Recorded inspection score</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight text-[#142D4E]">
            {score != null ? num(score) : "Unavailable"}
            {score != null && <span className="ml-1 text-lg font-normal text-slate-500">/ 100</span>}
            <Cite cite={e.cite} />
          </p>
        </div>
        <div className="text-sm"><p className="text-slate-500">Inspection date</p><p className="mt-1 font-medium text-slate-800">{date(e.date)}</p></div>
      </div>
      {score != null && (
        <div className="mt-4" role="img" aria-label={`Inspection score ${score} out of 100${comparable ? `; city median ${median}` : ""}`}>
          <CompareBar value={score} compare={comparable ? median : null} max={100} status={status}
            title={`Score ${score} / 100${comparable ? ` · city median ${median}` : ""}`} />
          {status && <p className="mt-2"><StatusTag status={status} label={SCORE_LABEL[status]} /></p>}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-600">
        {comparable ? <>City median: {num(median)} / 100 across {num(stats?.buildings)} buildings (each building&apos;s latest 2023+ evaluation)</> : "City median unavailable for this scoring system"}
        {e.percent_of_buildings_scoring_lower != null && <> · {e.percent_of_buildings_scoring_lower}% of evaluated buildings score lower</>}
        . A score describes a recorded inspection; it is not a guarantee of current conditions.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-[#142D4E]">Lowest-scoring categories</h3>
      {e.lowest_items?.length ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {e.lowest_items.map((item) => (
            <li key={item.item} className="flex items-center justify-between gap-4 py-3 text-sm">
              <span className="text-slate-700">{titleCase(item.item)}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[#142D4E]">{item.score} / {e.item_scale_max}</span>
            </li>
          ))}
        </ul>
      ) : <div className="mt-3"><Unavailable>Category-level results are unavailable for this evaluation.</Unavailable></div>}
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Category scale: 1 is the lowest score; {e.item_scale_max} is the highest{e.item_scale_max === 3 ? " (0 also appears in the data)" : ""}. Overall scores are weighted and cannot be inferred by averaging these items.
      </p>

      {b.history.length > 1 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-[#142D4E]">Evaluation history</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {b.history.map((h, i) => (
              <li key={i} className="rounded-full border border-slate-200 bg-[#F8FAFC] px-3 py-1 text-xs text-slate-700">
                {month(h.date)}: <span className="font-semibold text-[#142D4E]">{num(h.score)}</span><Cite cite={h.cite} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-5 text-slate-500">Evaluations before 2023 used a different scoring system, so older scores aren&apos;t directly comparable.</p>
        </>
      )}
      <SourceNote cite={e.cite} />
    </DashboardPanel>
  );
}
