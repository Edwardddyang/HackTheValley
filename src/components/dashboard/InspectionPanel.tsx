import type { BuildingCard } from "@/contracts/types";
import { DashboardPanel, formatDate, SourceNote, Unavailable } from "./DashboardPanel";

export default function InspectionPanel({ evaluation, demo, loading = false }: {
  evaluation: BuildingCard["evaluation"];
  demo: boolean;
  loading?: boolean;
}) {
  const validScore = evaluation && Number.isFinite(evaluation.score) && evaluation.score >= 0 && evaluation.score <= 100;
  const median = evaluation?.cityMedianScore;
  const validMedian = median != null && Number.isFinite(median) && median >= 0 && median <= 100;
  return (
    <DashboardPanel title="RentSafeTO inspection" subtitle="An inspection snapshot, with recorded categories and dates." demo={demo} loading={loading}>
      {!evaluation ? <Unavailable>No RentSafeTO evaluation is available for this building. Missing data does not establish the building’s condition.</Unavailable> : <>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-medium text-slate-500">{demo ? "Fictional inspection score" : "Recorded inspection score"}</p><p className="mt-2 text-5xl font-semibold tracking-tight text-[#142D4E]">{validScore ? evaluation.score : "Unavailable"}{validScore && <span className="ml-1 text-lg font-normal text-slate-500">/ 100</span>}</p></div>
          <div className="text-sm"><p className="text-slate-500">Inspection date</p><p className="mt-1 font-medium text-slate-800">{formatDate(evaluation.evaluatedOn)}</p></div>
        </div>
        {validScore && <meter min={0} max={100} value={evaluation.score} aria-label={`${demo ? "Fictional" : "Recorded"} inspection score out of 100`} className="mt-4 h-4 w-full accent-teal-700" />}
        <p className="mt-3 text-xs leading-5 text-slate-600">City median in this {demo ? "sample" : "report"}: {validMedian ? `${median} / 100` : "unavailable"}. A score describes a recorded inspection; it is not a guarantee of current conditions.</p>
        <h3 className="mt-6 text-sm font-semibold text-[#142D4E]">Inspection categories</h3>
        {evaluation.items.length ? <ul className="mt-3 divide-y divide-slate-100">{evaluation.items.map((item, index) => (
          <li key={`${item.key}-${index}`} className="flex items-center justify-between gap-4 py-3 text-sm">
            <span className="text-slate-700">{item.label}</span><span className="shrink-0 font-semibold tabular-nums text-[#142D4E]">{item.score} / 3</span>
          </li>
        ))}</ul> : <div className="mt-3"><Unavailable>Category-level inspection results are unavailable.</Unavailable></div>}
        <p className="mt-3 text-xs leading-5 text-slate-500">Category scale: 1 is the lowest recorded score; 3 is the highest. Overall scores are weighted and cannot be inferred by averaging these displayed items.</p>
        <SourceNote source={evaluation.source} demo={demo} />
      </>}
    </DashboardPanel>
  );
}
