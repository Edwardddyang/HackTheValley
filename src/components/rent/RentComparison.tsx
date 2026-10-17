import type { RentBenchmark } from "@/contracts/types";
import { SourceLink } from "@/components/ui/SourceLink";

interface RentComparisonProps {
  rent: RentBenchmark | null;
}

export function RentComparison({ rent }: RentComparisonProps) {
  if (!rent) {
    return (
      <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs">
        <h2 className="text-base font-bold text-[#142D4E]">CMHC rent comparison</h2>
        <p className="text-xs text-slate-500 mt-2">
          No CMHC survey data available for this neighbourhood zone.
        </p>
      </div>
    );
  }

  const { averageRent } = rent;

  return (
    <div className="p-6 bg-white border border-[#E2E8F0] rounded-2xl shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-[#142D4E]">CMHC rent comparison</h2>
          <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-medium">
            Demo data — illustrative only
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Survey averages by rental-market geography and unit type, in CAD per month.
        </p>

        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs mb-4">
          <span className="font-bold text-slate-700 block">{rent.zone}</span>
          <span className="text-slate-400">Survey year: {rent.surveyYear}</span>
        </div>

        <p className="text-[11px] text-amber-800/90 font-medium mb-4">
          Sample data: all rent figures below are illustrative, not actual CMHC survey results.
        </p>

        {/* Breakdown table */}
        <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
          <div className="grid grid-cols-2 p-2.5 bg-slate-50 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
            <span>Unit type</span>
            <span className="text-right">Monthly average</span>
          </div>

          <div className="divide-y divide-slate-100 text-slate-700">
            <div className="grid grid-cols-2 p-2.5">
              <span>Bachelor</span>
              <span className="text-right font-semibold font-mono">
                {averageRent.bachelor ? `$${averageRent.bachelor.toLocaleString()}` : "Unavailable"}
              </span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span>1 bedroom</span>
              <span className="text-right font-semibold font-mono">
                {averageRent.oneBed ? `$${averageRent.oneBed.toLocaleString()}` : "Unavailable"}
              </span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span>2 bedrooms</span>
              <span className="text-right font-semibold font-mono">
                {averageRent.twoBed ? `$${averageRent.twoBed.toLocaleString()}` : "Unavailable"}
              </span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span>3+ bedrooms</span>
              <span className="text-right font-semibold font-mono">
                {averageRent.threePlusBed ? `$${averageRent.threePlusBed.toLocaleString()}` : "Unavailable"}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5 text-xs">
          <span className="font-bold text-slate-700 block">Asking-rent comparison</span>
          <p className="text-slate-500 leading-relaxed">
            A comparison needs both an asking rent and a matching unit type with an available benchmark. No comparable listing information is available in this report.
          </p>
          <p className="text-[11px] text-slate-400">
            Survey averages describe the stated geography and year. They are not a valuation of this apartment or current asking-rent estimates; condition and included utilities may differ.
          </p>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100">
        <SourceLink source={rent.source} />
      </div>
    </div>
  );
}