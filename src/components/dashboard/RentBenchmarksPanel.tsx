import type { ListingExtraction, RentBenchmark } from "@/contracts/types";
import { DashboardPanel, SourceNote, Unavailable } from "./DashboardPanel";

const unitTypes = [
  { key: "bachelor", label: "Bachelor", bedrooms: 0 },
  { key: "oneBed", label: "1 bedroom", bedrooms: 1 },
  { key: "twoBed", label: "2 bedrooms", bedrooms: 2 },
  { key: "threePlusBed", label: "3+ bedrooms", bedrooms: 3 },
] as const;
const validRent = (value: number | null | undefined): value is number => value != null && Number.isFinite(value) && value > 0;
const money = (value: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);

export default function RentBenchmarksPanel({ rent, listing, demo, loading = false }: {
  rent: RentBenchmark | null;
  listing: ListingExtraction | null;
  demo: boolean;
  loading?: boolean;
}) {
  const bedrooms = listing?.bedrooms;
  // A 3+ aggregate is broader than one exact bedroom count: never treat it as
  // an equivalent listing comparison. No AI extraction is performed here.
  const unitType = unitTypes.find((unit) => bedrooms === unit.bedrooms && unit.bedrooms < 3);
  const benchmark = rent && unitType ? rent.averageRent[unitType.key] : null;
  const comparable = !!rent && validRent(listing?.askingRent) && !!unitType && validRent(benchmark);
  return (
    <DashboardPanel title="CMHC rent comparison" subtitle="Survey averages by rental-market geography and unit type, in CAD per month." demo={demo} loading={loading}>
      {!rent ? <Unavailable>No rental-market benchmark is available for this address.</Unavailable> : <>
        <div className="rounded-xl bg-[#F8FAFC] p-4"><p className="text-sm font-semibold text-[#142D4E]">{rent.zone || "Survey geography unavailable"}</p><p className="mt-1 text-xs text-slate-600">Survey year: {Number.isInteger(rent.surveyYear) && rent.surveyYear > 0 ? rent.surveyYear : "Unavailable"}</p></div>
        {demo && <p className="mt-4 text-sm font-medium leading-6 text-amber-900">Sample data: all rent figures below are illustrative, not actual CMHC survey results.</p>}
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{demo ? "Sample" : "Survey"} monthly average rent by unit type for {rent.zone}, {rent.surveyYear}</caption>
            <thead className="bg-slate-50 text-xs text-slate-500"><tr><th scope="col" className="px-4 py-3 font-medium">Unit type</th><th scope="col" className="px-4 py-3 text-right font-medium">Monthly average</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{unitTypes.map((unit) => {
              const value = rent.averageRent[unit.key];
              return <tr key={unit.key}><th scope="row" className="px-4 py-3 font-medium text-slate-700">{unit.label}</th><td className="px-4 py-3 text-right tabular-nums text-[#142D4E]">{validRent(value) ? money(value) : "Unavailable"}</td></tr>;
            })}</tbody>
          </table>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 p-4 text-sm leading-6 text-slate-600">
          <h3 className="font-semibold text-[#142D4E]">Asking-rent comparison</h3>
          {comparable && listing && validRent(listing.askingRent) && validRent(benchmark) ? <>
            <p className="mt-2">{demo ? "Sample asking rent" : "Listing asking rent"}: {money(listing.askingRent)} for {unitType?.label.toLowerCase()}. The matching survey average is {money(benchmark)}.</p>
            <p className="mt-2">Difference: {money(Math.abs(listing.askingRent - benchmark))} {listing.askingRent === benchmark ? "— equal to" : listing.askingRent > benchmark ? "above" : "below"} the survey average.</p>
          </> : <p className="mt-2">{bedrooms != null && bedrooms >= 3 ? "The available 3+ bedroom benchmark groups multiple unit sizes. An exact-bedroom comparison is unavailable." : "A comparison needs both an asking rent and a matching unit type with an available benchmark. No comparable listing information is available in this report."}</p>}
          <p className="mt-3 text-xs leading-5">Survey averages describe the stated geography and year. They are not a valuation of this apartment or current asking-rent estimates; condition and included utilities may differ.</p>
        </div>
        <SourceNote source={rent.source} demo={demo} />
      </>}
    </DashboardPanel>
  );
}
