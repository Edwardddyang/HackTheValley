// Parks, recreation and public services around an address, read from a static extract of City of Toronto open
// data committed at public/services-toronto.json (built by scripts/build-services.mjs). Like the essentials, the
// layers degrade to a notice if the file can't load.

export type ServiceCategory = "park" | "community" | "pool" | "rink" | "library" | "fire" | "police";
export type ServiceGroup = "recreation" | "public";

export type Service = {
  category: ServiceCategory;
  name: string;
  address: string | null;
  /** Parks: the City's listed amenities ("Playground, Washroom"); pools: indoor or outdoor. */
  detail: string | null;
  url: string | null;
  lat: number;
  lon: number;
  distance_m: number;
};

export const SERVICE_GROUP: Record<ServiceCategory, ServiceGroup> = {
  park: "recreation", community: "recreation", pool: "recreation", rink: "recreation",
  library: "public", fire: "public", police: "public",
};

/** Display order within each group. */
export const SERVICE_CATEGORIES: readonly ServiceCategory[] = ["park", "community", "pool", "rink", "library", "fire", "police"];

export const SERVICE_LABELS: Record<ServiceCategory, string> = {
  park: "Park", community: "Community centre", pool: "Pool", rink: "Ice rink",
  library: "Library", fire: "Fire station", police: "Police",
};

/** Dataset each category comes from, for popups. */
export const SERVICE_SOURCES: Record<ServiceCategory, string> = {
  park: "City of Toronto, Parks and Recreation Facilities",
  community: "City of Toronto, Parks and Recreation Facilities",
  pool: "City of Toronto, Heat Relief Network",
  rink: "City of Toronto, Indoor Ice Rinks",
  library: "Toronto Public Library",
  fire: "City of Toronto, Fire Station Locations",
  police: "Toronto Police Service facilities",
};

/** How far each category is searched: parks and the like are walking distance; stations serve a wider area. */
export const SERVICE_RADIUS_M: Record<ServiceCategory, number> = {
  park: 1000, community: 1500, pool: 1500, rink: 2500, library: 2000, fire: 3000, police: 4000,
};

/** Per-category cap on map markers, nearest first. */
const PER_CATEGORY: Record<ServiceCategory, number> = { park: 10, community: 4, pool: 4, rink: 2, library: 3, fire: 2, police: 2 };

export type ServiceResult = { items: Service[]; asof: string | null };

/** Packed rows of public/services-toronto.json. */
type Packed = { c: ServiceCategory; n: string; la: number; lo: number; a?: string; x?: string; u?: string; i?: string };

const PARK_PAGE = "https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id=";

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let file: Promise<{ asof?: string; items?: Packed[] }> | null = null;

export async function fetchServices(lat: number, lon: number): Promise<ServiceResult> {
  file ??= fetch("/services-toronto.json", { signal: AbortSignal.timeout(12_000) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`services file responded ${r.status}`))));
  file.catch(() => { file = null; }); // a later visit may retry
  const json = await file;
  const out: Service[] = [];
  for (const it of json.items ?? []) {
    if (!SERVICE_LABELS[it.c]) continue;
    const d = haversineM(lat, lon, it.la, it.lo);
    if (d > SERVICE_RADIUS_M[it.c]) continue;
    out.push({
      category: it.c, name: it.n, address: it.a ?? null, detail: it.x ?? null,
      url: it.u ?? (it.i ? PARK_PAGE + it.i : null),
      lat: it.la, lon: it.lo, distance_m: Math.round(d),
    });
  }
  const kept: Partial<Record<ServiceCategory, number>> = {};
  const items = out.sort((a, b) => a.distance_m - b.distance_m).filter((s) => {
    kept[s.category] = (kept[s.category] ?? 0) + 1;
    return kept[s.category]! <= PER_CATEGORY[s.category];
  });
  return { items, asof: json.asof ?? null };
}
