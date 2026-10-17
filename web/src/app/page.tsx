import Link from "next/link";
import { Suspense } from "react";

import { BriefView } from "@/components/BriefView";
import { SearchBox } from "@/components/SearchBox";
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, MIN_RADIUS_M } from "@/lib/brief";
import { loadBrief } from "@/lib/load";

const EXAMPLES = ["200 Elm St", "326 Avenue Rd", "100 Queen St W", "2000 Eglinton Ave E"];

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

async function Content({ searchParams }: Pick<PageProps<"/">, "searchParams">) {
  const sp = await searchParams;
  const address = first(sp.address)?.trim() || null;
  const idRaw = first(sp.id);
  const id = idRaw && /^\d+$/.test(idRaw) ? Number(idRaw) : null;
  const rRaw = Number(first(sp.r) ?? DEFAULT_RADIUS_M);
  const radius = Number.isInteger(rRaw) && rRaw >= MIN_RADIUS_M && rRaw <= MAX_RADIUS_M ? rRaw : DEFAULT_RADIUS_M;

  if (!address && id == null) {
    return <Landing />;
  }
  return (
    <Shell search={<SearchBox key={`${id}-${address}`} initialAddress={address ?? ""} initialRadius={radius} />}>
      <Suspense key={`${id}-${address}-${radius}`} fallback={<BriefSkeleton />}>
        <Results address={address} id={id} radius={radius} />
      </Suspense>
    </Shell>
  );
}

async function Results({ address, id, radius }: { address: string | null; id: number | null; radius: number }) {
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
  return <BriefView brief={result.brief} alternatives={result.alternatives} radius={radius} />;
}

function Shell({ search, children }: { search?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-page/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-6">
          <Link href="/" className="shrink-0 text-[15px] font-semibold tracking-tight text-ink">
            Block Brief <span className="font-normal text-ink-3">Toronto</span>
          </Link>
          <div className="w-full max-w-2xl">{search}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5">{search ? children : null}</main>
    </div>
  );
}

function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-2xl">
        <p className="text-[13px] font-medium uppercase tracking-wider text-ink-3">Block Brief · Toronto</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          What&apos;s happening on your street?
        </h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink-2">
          Look up a rental before you sign. See the building&apos;s City inspection score, construction and
          development nearby, 311 complaints, crime and neighbourhood rents, every figure linked to the open-data
          row it came from.
        </p>
        <div className="mt-8">
          <SearchBox autoFocus />
        </div>
        <p className="mt-4 text-[13px] text-ink-3">
          Try{" "}
          {EXAMPLES.map((e, i) => (
            <span key={e}>
              {i > 0 ? ", " : ""}
              <Link className="text-accent hover:underline" href={`/?address=${encodeURIComponent(e)}`}>{e}</Link>
            </span>
          ))}
        </p>
      </div>
    </main>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-surface p-6">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-2">{children}</p>
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Loading brief">
      <div className="h-[55vh] animate-pulse rounded-xl border border-border bg-surface-2 lg:h-[calc(100vh-112px)]" />
      <div className="space-y-4">
        {[96, 220, 180, 240].map((h, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-border bg-surface" style={{ height: h }} />
        ))}
      </div>
    </div>
  );
}
