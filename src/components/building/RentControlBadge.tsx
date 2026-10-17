import type { RentControl } from "@/contracts/types";

interface RentControlBadgeProps {
  status: RentControl;
  yearBuilt: number | null;
}

export function RentControlBadge({ status, yearBuilt }: RentControlBadgeProps) {
  const isLikelyControlled = status === "likely-controlled";
  const isLikelyExempt = status === "likely-exempt";

  return (
    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 tracking-wide">
          Rent-control information
        </span>
        <span
          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            isLikelyControlled
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : isLikelyExempt
              ? "bg-amber-50 text-amber-800 border border-amber-200"
              : "bg-slate-100 text-slate-700 border border-slate-200"
          }`}
        >
          {isLikelyControlled && "Likely rent-controlled"}
          {isLikelyExempt && "Likely exempt from rent control"}
          {status === "unknown" && "Status unconfirmed"}
        </span>
      </div>

      <p className="text-xs text-slate-600 leading-relaxed">
        {isLikelyControlled &&
          `Built around ${yearBuilt || "prior to 2018"}. Under the Ontario RTA, residential units first occupied before November 15, 2018 are generally protected by annual guideline rent-increase limits.`}
        {isLikelyExempt &&
          `Built/occupied after November 15, 2018 (${yearBuilt || "recent"}). Units first occupied for residential purposes after this date are exempt from provincial annual rent-increase caps.`}
        {status === "unknown" &&
          "Year built or first residential occupancy date unavailable. Verify initial occupancy with the landlord."}
      </p>
    </div>
  );
}