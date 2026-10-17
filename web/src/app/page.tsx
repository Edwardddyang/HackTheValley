import { Suspense } from "react";

import { BriefView, type ListingHints } from "@/components/BriefView";
import { HomeTools } from "@/components/HomeTools";
import { SearchBox } from "@/components/SearchBox";
import { SiteHeader } from "@/components/SiteHeader";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from "@/lib/brief";
import { loadBrief } from "@/lib/load";

const COVERS = [
  { term: "The building's City inspection", detail: "Its RentSafeTO score against the city median, the items inspectors graded lowest, and heating, cooling and pets from the building's registration." },
  { term: "Whether the rent is in line", detail: "The listing's asking rent next to CMHC's October survey rents for the area, and whether rent control likely applies." },
  { term: "What's changing nearby", detail: "Building permits and development applications around the address, with community meeting dates." },
  { term: "The neighbourhood", detail: "311 requests in the area, Toronto Police neighbourhood crime rates and 2021 Census figures, each against the city." },
];

export default function Page(props: PageProps<"/">) {
  return (
    <Suspense fallback={<Shell search={<SearchBox />}>{null}</Shell>}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

function first(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

/** rent and beds come from a pasted listing; ignore anything that isn't a plausible value. */
function listingHints(sp: Record<string, string | string[] | undefined>): ListingHints {
  const rentRaw = first(sp.rent);
  const rent = rentRaw && /^\d{2,6}$/.test(rentRaw) && Number(rentRaw) >= 50 && Number(rentRaw) <= 100_000 ? Number(rentRaw) : null;
  const bedsRaw = first(sp.beds);
  const beds = bedsRaw && /^\d{1,2}$/.test(bedsRaw) && Number(bedsRaw) <= 20 ? Number(bedsRaw) : null;
  return { rent, beds };
}

async function Content({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const sp = await searchParams;
  const address = first(sp.address)?.trim() || null;
  const idRaw = first(sp.id);
  const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  const rRaw = Number(first(sp.r) ?? DEFAULT_RADIUS_M);
  const radius = Number.isInteger(rRaw) && rRaw >= MIN_RADIUS_M && rRaw <= MAX_RADIUS_M ? rRaw : DEFAULT_RADIUS_M;
  const listing = listingHints(sp);

  if (!address && id == null) {
    return <Landing />;
  }
  const keep = `${listing.rent != null ? `&rent=${listing.rent}` : ""}${listing.beds != null ? `&beds=${listing.beds}` : ""}`;
  return (
    <Shell search={<SearchBox key={`${id}-${address}`} initialAddress={address ?? ""} initialRadius={radius} keep={keep} keepFor={address ?? ""} />}>
      <Suspense key={`${id}-${address}-${radius}`} fallback={<BriefSkeleton />}>
        <Results address={address} id={id} radius={radius} listing={listing} />
      </Suspense>
    </Shell>
  );
}

async function Results({ address, id, radius, listing }: { address: string | null; id: number | null; radius: number; listing: ListingHints }) {
  let result;
  try {
    result = await loadBrief(address, id, radius);
  } catch (err) {
    console.error(err);
    return <Notice title="Couldn't build the brief">The data service didn&apos;t respond in time. Try again in a moment.</Notice>;
  }
  if (result.kind === "not_found") {
    return <Notice title="Address not found">{result.message}</Notice>;
  }
  return (
    <BriefView brief={result.brief} extras={result.extras} alternatives={result.alternatives} radius={radius}
      listing={listing} fixture={result.fixture} />
  );
}

function Shell({ search, children }: { search?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader sticky search={search} />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 outline-none">{children}</main>
    </>
  );
}

function Landing() {
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-10 outline-none sm:px-6 sm:pt-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-x-14">
          <div className="lg:col-start-1 lg:row-start-1 lg:pt-4">
            <h1 className="plate text-[clamp(2.75rem,9vw,4.75rem)] font-bold text-ink">Check the building before you sign.</h1>
            <p className="mt-5 max-w-[34ch] text-[1.25rem] leading-snug text-ink-2">
              Paste a Toronto rental ad and see the building&apos;s City inspection record and what&apos;s around it, with
              every fact linked to the open-data row it came from.
            </p>
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <HomeTools />
          </div>

          <div className="lg:col-start-1 lg:row-start-2">
            <h2 className="plate text-[1.4rem] font-bold text-ink">What the brief covers</h2>
            <dl className="mt-3 flex max-w-[46ch] flex-col gap-3">
              {COVERS.map((c) => (
                <div key={c.term} className="border-l-2 border-baseline pl-3">
                  <dt className="font-semibold text-ink">{c.term}</dt>
                  <dd className="text-[15px] text-ink-2">{c.detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </main>
    </>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-lg border border-border bg-surface p-6" role="alert">
      <h1 className="plate text-[1.6rem] font-bold text-ink">{title}</h1>
      <p className="mt-1 text-[15px] text-ink-2">{children}</p>
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
      <p className="sr-only" role="status">Loading the brief…</p>
      <div className="skeleton h-[45vh] rounded-xl lg:h-[calc(100vh-112px)]" />
      <div className="space-y-4">
        {[120, 220, 180, 240].map((h, i) => (
          <div key={i} className="skeleton rounded-xl" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}
