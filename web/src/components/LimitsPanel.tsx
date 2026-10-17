import Link from "next/link";

/** What the records can't say. Shown on every brief; /sources has the per-dataset detail. */
export const LIMITS: readonly string[] = [
  "RentSafeTO only covers apartment buildings with 3 or more storeys and 10 or more units. Condos, basement units and houses aren't included, and inspectors look at shared spaces and records, not the inside of your unit.",
  "311 requests are located only to a postal area or a street intersection, never to an address, so the counts describe the area and not this building. The data has no closed date, so it can't show how quickly the City responded.",
  "Rent control is only \"likely\". The year built stands in for the date units were first occupied; units first occupied after November 15, 2018 are generally exempt from Ontario's rent-increase guideline.",
  "CMHC rents cover purpose-built rentals across a large area. The all-units average includes long-time tenants, so asking rents are compared with the rent of units that were vacant at survey time.",
  "Crime figures are Toronto Police Service rates for the whole neighbourhood, not for this street.",
  "Building registration details are filled in by landlords and can be blank or out of date. Census figures are from 2021.",
];

export function LimitsPanel() {
  return (
    <section id="limits" aria-labelledby="limits-h" className="rounded-lg border-2 border-ink bg-surface p-4 sm:p-6">
      <h2 id="limits-h" className="plate text-[1.75rem] font-bold text-ink sm:text-[2rem]">What this data can&apos;t tell you</h2>
      <ul className="mt-3 flex max-w-[68ch] flex-col gap-2.5 text-[15px] text-ink">
        {LIMITS.map((l) => (
          <li key={l} className="flex gap-3">
            <span aria-hidden="true" className="mt-[0.55em] h-2 w-2 shrink-0 bg-ink" />
            <span>{l}</span>
          </li>
        ))}
        <li className="flex gap-3">
          <span aria-hidden="true" className="mt-[0.55em] h-2 w-2 shrink-0 bg-ink" />
          <span>
            Public records can&apos;t tell you how the landlord treats tenants, what your unit is like inside, or what the
            lease says. See the unit in person and read the lease before you sign.
          </span>
        </li>
      </ul>
      <p className="mt-4 text-[15px]">
        <Link href="/sources" className="font-semibold text-accent underline underline-offset-2">Where every number on this page comes from</Link>
      </p>
    </section>
  );
}
