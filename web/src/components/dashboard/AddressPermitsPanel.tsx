import type { Brief } from "@/lib/brief";
import { compactMoney, date } from "@/lib/format";

import { DashboardPanel, ShowMore, SourceNote, Unavailable } from "./DashboardPanel";

export default function AddressPermitsPanel({ brief }: { brief: Brief }) {
  const p = brief.permits_at_address;
  return (
    <DashboardPanel wide id="address-permits" title="Permits at this address" subtitle={p.note}>
      {p.items.length === 0 ? <Unavailable>No permits on record for this exact address.</Unavailable> : (
        <ShowMore noun="permits" items={p.items.map((i) => (
            <li key={i.permit_num + i.type + i.status} className="rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-[#142D4E]">{i.type}</p>
                <p className="text-xs text-slate-500">{i.group === "active" ? "Active" : `Completed ${date(i.completed_date)}`}</p>
              </div>
              <p className="mt-1 text-slate-600">{i.work ?? "—"} · {i.status}{i.est_const_cost ? ` · ${compactMoney(i.est_const_cost)} est.` : ""}</p>
              {i.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{i.description}</p>}
              <SourceNote cite={i.cite} />
            </li>
          ))} />
      )}
    </DashboardPanel>
  );
}
