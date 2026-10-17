import Link from "next/link";
import { Suspense } from "react";

import { AdCheckPanel } from "@/components/ai/AdCheckPanel";
import { ChecklistPanel, SummaryPanel, SummaryProvider } from "@/components/ai/SummaryPanels";
import { BriefTabs } from "@/components/BriefTabs";
import { Cite } from "@/components/Cite";
import AddressPermitsPanel from "@/components/dashboard/AddressPermitsPanel";
import AreaComplaintsPanel from "@/components/dashboard/AreaComplaintsPanel";
import BuildingSummaryPanel from "@/components/dashboard/BuildingSummaryPanel";
import CrimePanel from "@/components/dashboard/CrimePanel";
import DevelopmentPanel from "@/components/dashboard/DevelopmentPanel";
import InspectionPanel from "@/components/dashboard/InspectionPanel";
import NearbyBuildingsPanel from "@/components/dashboard/NearbyBuildingsPanel";
import NearbyConstructionPanel from "@/components/dashboard/NearbyConstructionPanel";
import NeighbourhoodPanel from "@/components/dashboard/NeighbourhoodPanel";
import RentPanel from "@/components/dashboard/RentPanel";
import { rate } from "@/components/dashboard/DashboardPanel";
import NeighbourhoodMap from "@/components/map/NeighbourhoodMap";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import AddressSearch from "@/components/search/AddressSearch";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DEFAULT_RADIUS_M } from "@/lib/brief";
import { bedroomsLabel, metres, money, num } from "@/lib/format";
import { buildingHref, hasListing, listingQuery, parseListingHints } from "@/lib/listing-params";
import { loadBrief } from "@/lib/load";

import Loading from "./loading";

// Report layout from feature/frontend (Satwik): every panel is filled from bb_brief and bb_extras. The Gemini
// panels (What to flag, viewing questions, ad check) come from integrate/best-of-both (Ariaz).
const RADII = [250, 500, 1000];

const LIMITATIONS = [
  "RentSafeTO only covers apartment buildings with 3+ storeys and 10+ units. A missing evaluation does not establish a building's condition.",
  "311 requests are recorded by postal area, intersection or ward, never by building. Only requests reported at an intersection appear on the map, and the data has no closed dates, so resolution times are unknown.",
  "Building permits come from the City's active and cleared permit files; cleared permits are limited to those completed since 2025. About 9% of permits have no matching address point and are not on the map.",
  "Crime figures are Toronto Police Service rates for the whole neighbourhood, not a street or building.",
  "Census figures are from 2021 and describe the neighbourhood. Shelter cost is not a current asking rent.",
  "Rent-control status can't be determined from these datasets: it depends on first residential occupancy, which isn't recorded here.",
  "CMHC rents are October survey averages for purpose-built rental apartments across a large area, not a valuation of one unit. Building registration details are filled in by landlords.",
  "What to flag, the viewing questions and the ad check are written by Google Gemini from the records on this page, and each line cites the records it used; when the AI is unavailable they fall back to a fixed template. AI can misread a record, so confirm anything important with the landlord or the City.",
  "A pasted listing is read by Gemini; the listing site itself is never visited.",
  "The map's essentials (subway, groceries, pharmacies, hospitals) come from an OpenStreetMap extract (ODbL); distances are straight-line. Neighbourhood shading uses City boundaries with the same Census and Toronto Police figures. The Flyover, when enabled, streams Google Photorealistic 3D Tiles, whose imagery may be years old.",
];

const count = (n: number | null | undefined) => (n ? num(n) : null);

/** Panels within a tab: two columns on wide screens; a panel can span both. */
function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2 xl:gap-6">{children}</div>;
}

async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const rRaw = Number(Array.isArray(sp.r) ? sp.r[0] : sp.r);
  const radius = RADII.includes(rRaw) ? rRaw : DEFAULT_RADIUS_M;
  const notFound = (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-semibold">Address not found</h1>
      <p className="mt-4 text-slate-600">There is no Toronto address point with this ID. Search for an address to continue.</p>
      <Link href="/#search" className="mt-6 inline-block rounded-lg bg-[#142D4E] px-5 py-3 text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">Choose another address</Link>
    </main>
  );
  if (!/^\d+$/.test(id)) return notFound;
  const result = await loadBrief(Number(id), radius);
  if (result.kind !== "ok") return notFound;
  const { brief, stats, extras } = result;
  const listing = parseListingHints(sp);
  const listingQ = listingQuery(listing);
  const { area } = brief;
  const typeLabels = brief.development_applications.type_labels;
  const crimeAbove = brief.crime.offences.filter((o) => rate(o.rate_per_100k, o.city_rate_per_100k, { direction: "higher-worse", tolerance: 0.1 }) === "poor").length;

  return (
    <main className="mx-auto max-w-[1600px] px-6 lg:px-10 py-10 sm:py-14">
      <header>
        <p className="text-xs font-semibold tracking-[0.16em] text-teal-700 uppercase">Your building brief</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{brief.address.address}<Cite cite={brief.address.cite} /></h1>
        <p className="mt-3 text-sm text-slate-600">
          {area.neighbourhood && <>{area.neighbourhood.name}<Cite cite={area.neighbourhood.cite} /></>}
          {area.ward && <>{" · "}Ward {area.ward.ward_number} {area.ward.name}<Cite cite={area.ward.cite} /></>}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Radius:</span>
          {RADII.map((r) => (
            <Link key={r} href={buildingHref(id, { radius: r === DEFAULT_RADIUS_M ? null : r, listing: listingQ })} aria-current={r === radius ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${r === radius ? "border-[#142D4E] bg-[#142D4E] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {metres(r)}
            </Link>
          ))}
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600">From City of Toronto open data, Toronto Police and CMHC. Pick a tab below; hover a source tag to see the dataset row behind a figure.</p>
        {hasListing(listing) && (
          <p className="mt-4 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-950">
            <span className="font-semibold">From your listing:</span>
            {listing.rent != null && <span className="tabular-nums">{money(listing.rent)} / month</span>}
            {listing.beds != null && <span>{bedroomsLabel(listing.beds)}</span>}
            {listing.claims.length > 0 && <a href="#adcheck" className="font-medium underline underline-offset-2">{listing.claims.length} claim{listing.claims.length === 1 ? "" : "s"} checked</a>}
            {listing.rent != null && <a href="#rent" className="font-medium underline underline-offset-2">rent vs CMHC</a>}
          </p>
        )}
      </header>
      {/* The map sits above the tabs, so it's the first thing seen and stays put whichever tab is open. */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6" aria-labelledby="map-title">
        <h2 id="map-title" className="text-xl font-semibold">Around the block</h2>
        <NeighbourhoodMap brief={brief} typeLabels={typeLabels} />
      </section>
      <div className="mt-8">
        {/* One /api/summary call feeds both What to flag and the viewing questions. */}
        <SummaryProvider key={`${brief.address.address_point_id}-${radius}-${listing.rent}-${listing.beds}`}
          addressPointId={brief.address.address_point_id} radius={brief.address.radius_m} rent={listing.rent} beds={listing.beds}>
        <BriefTabs tabs={[
          { id: "overview", label: "Overview", content: (
            <Grid>
              <SummaryPanel />
              <BuildingSummaryPanel brief={brief} extras={extras} />
              <InspectionPanel brief={brief} stats={stats} />
              <ChecklistPanel address={brief.address.address} />
            </Grid>
          ) },
          ...(listing.claims.length > 0 ? [{ id: "adcheck", label: "Ad check", badge: num(listing.claims.length), content: (
            <Grid>
              <AdCheckPanel addressPointId={brief.address.address_point_id} radius={brief.address.radius_m}
                rent={listing.rent} beds={listing.beds} claims={listing.claims} />
            </Grid>
          ) }] : []),
          { id: "rent", label: "Rent", badge: listing.rent != null ? "Your listing" : null, content: (
            <Grid><RentPanel benchmark={extras?.rent_benchmark ?? null} listing={listing} /></Grid>
          ) },
          { id: "buildings", label: "Nearby buildings", badge: count(brief.rentsafe_nearby.buildings.length), content: (
            <Grid><NearbyBuildingsPanel brief={brief} stats={stats} /></Grid>
          ) },
          { id: "construction", label: "Construction", badge: count(brief.construction_nearby.active_permit_count), content: (
            <Grid>
              <NearbyConstructionPanel brief={brief} />
              <DevelopmentPanel brief={brief} />
              <AddressPermitsPanel brief={brief} />
            </Grid>
          ) },
          { id: "311", label: "311 requests", badge: count(brief.service_requests_311.nearby.count), content: (
            <Grid><AreaComplaintsPanel brief={brief} /></Grid>
          ) },
          { id: "crime", label: "Crime", badge: crimeAbove ? `${crimeAbove} above city` : null, content: (
            <Grid><CrimePanel brief={brief} /></Grid>
          ) },
          { id: "neighbourhood", label: "Neighbourhood", content: (
            <Grid><NeighbourhoodPanel brief={brief} /></Grid>
          ) },
          { id: "reviews", label: "Reviews", badge: "Soon", content: (
            <Grid><ReviewsSection /></Grid>
          ) },
          { id: "about", label: "About the data", content: (
            <section className="rounded-2xl border border-slate-200 bg-slate-100 p-6" aria-labelledby="limitations-title">
              <h2 id="limitations-title" className="text-xl font-semibold">Sources and limitations</h2>
              <ul className="mt-4 max-w-4xl list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
            </section>
          ) },
        ]} />
        </SummaryProvider>
      </div>
    </main>
  );
}

export default function BuildingPage(props: PageProps<"/building/[id]">) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#142D4E]">
      <SiteHeader>
        <div className="w-full max-w-sm sm:w-80"><AddressSearch compact /></div>
      </SiteHeader>
      <Suspense fallback={<Loading />}><Report params={props.params} searchParams={props.searchParams} /></Suspense>
      <SiteFooter />
    </div>
  );
}
