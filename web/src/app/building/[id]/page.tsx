import Link from "next/link";
import { Suspense } from "react";

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
import NeighbourhoodMap from "@/components/map/NeighbourhoodMap";
import { ReviewsSection } from "@/components/reviews/ReviewsSection";
import AddressSearch from "@/components/search/AddressSearch";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { DEFAULT_RADIUS_M } from "@/lib/brief";
import { metres } from "@/lib/format";
import { loadBrief } from "@/lib/load";

import Loading from "./loading";

// Report layout from feature/frontend (Satwik): every panel is filled from bb_brief.
const RADII = [250, 500, 1000];

const LIMITATIONS = [
  "RentSafeTO only covers apartment buildings with 3+ storeys and 10+ units. A missing evaluation does not establish a building's condition.",
  "311 requests are recorded by postal area, intersection or ward, never by building. Only requests reported at an intersection appear on the map, and the data has no closed dates, so resolution times are unknown.",
  "Building permits come from the City's active and cleared permit files; cleared permits are limited to those completed since 2025. About 9% of permits have no matching address point and are not on the map.",
  "Crime figures are Toronto Police Service rates for the whole neighbourhood, not a street or building.",
  "Census figures are from 2021 and describe the neighbourhood. Shelter cost is not a current asking rent.",
  "Rent-control status can't be determined from these datasets: it depends on first residential occupancy, which isn't recorded here.",
];

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
  const { brief, stats } = result;
  const { area } = brief;
  const typeLabels = brief.development_applications.type_labels;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
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
            <Link key={r} href={`/building/${id}${r === DEFAULT_RADIUS_M ? "" : `?r=${r}`}`} aria-current={r === radius ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${r === radius ? "border-[#142D4E] bg-[#142D4E] text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
              {metres(r)}
            </Link>
          ))}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">Building information, inspection records and the surrounding area, from City of Toronto open data. Hover a source tag to see the dataset row behind a figure, and check each panel&apos;s notes for what the data can&apos;t tell you.</p>
      </header>
      <div className="mt-9 grid gap-5 md:grid-cols-2">
        <BuildingSummaryPanel brief={brief} />
        <InspectionPanel brief={brief} stats={stats} />
        <section className="rounded-2xl border border-slate-200 bg-white p-6 md:col-span-2" aria-labelledby="map-title">
          <h2 id="map-title" className="text-xl font-semibold">Around the block</h2>
          <NeighbourhoodMap brief={brief} typeLabels={typeLabels} />
        </section>
        <NearbyConstructionPanel brief={brief} />
        <DevelopmentPanel brief={brief} />
        <AreaComplaintsPanel brief={brief} />
        <NearbyBuildingsPanel brief={brief} />
        <AddressPermitsPanel brief={brief} />
        <CrimePanel brief={brief} />
        <NeighbourhoodPanel brief={brief} />
        <ReviewsSection />
        <section className="rounded-2xl border border-slate-200 bg-slate-100 p-6 md:col-span-2" aria-labelledby="limitations-title">
          <h2 id="limitations-title" className="text-xl font-semibold">Sources and limitations</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
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
