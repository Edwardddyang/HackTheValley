// Everyday essentials around an address, read from a static OpenStreetMap extract for Toronto
// committed at public/amenities-toronto.json (the public Overpass servers are too flaky to rely
// on live during a demo). The layer degrades to a notice if the file can't load.

export type AmenityCategory = "subway" | "grocery" | "pharmacy" | "hospital";

export type Amenity = {
  category: AmenityCategory;
  name: string;
  lat: number;
  lon: number;
  distance_m: number;
};

/** Legend order. */
export const AMENITY_CATEGORIES: readonly AmenityCategory[] = ["subway", "grocery", "pharmacy", "hospital"];

export const AMENITY_LABELS: Record<AmenityCategory, string> = {
  subway: "Subway station", grocery: "Grocery", pharmacy: "Pharmacy", hospital: "Hospital",
};

/** Letters for map badges; P and A are taken by permits and applications. */
export const AMENITY_LETTERS: Record<AmenityCategory, string> = {
  subway: "T", grocery: "G", pharmacy: "D", hospital: "H",
};

const WALKABLE_M = 1200;
const HOSPITAL_M = 3000; // the nearest hospital is routinely beyond walking distance

/** How far each category is searched, for the legend's "none within …" rows. */
export const AMENITY_RADIUS_M: Record<AmenityCategory, number> = {
  subway: WALKABLE_M, grocery: WALKABLE_M, pharmacy: WALKABLE_M, hospital: HOSPITAL_M,
};

/** Per-category cap on map markers. Capped per category, not overall, so a dense downtown block
 *  full of pharmacies can't push the nearest hospital off the list. */
const PER_CATEGORY = 15;

export type AmenityResult = {
  items: Amenity[];
  /** The extract's date (YYYY-MM-DD), from the file. */
  asof: string | null;
};

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Packed rows of public/amenities-toronto.json. */
type Packed = { c: "s" | "g" | "p" | "h"; n?: string; la: number; lo: number };

const CAT: Record<Packed["c"], AmenityCategory> = { s: "subway", g: "grocery", p: "pharmacy", h: "hospital" };

const cache = new Map<string, Promise<AmenityResult>>();

export function fetchAmenities(lat: number, lon: number): Promise<AmenityResult> {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  let p = cache.get(key);
  if (!p) {
    p = query(lat, lon);
    p.catch(() => cache.delete(key)); // a later visit may retry
    cache.set(key, p);
  }
  return p;
}

async function query(lat: number, lon: number): Promise<AmenityResult> {
  const res = await fetch("/amenities-toronto.json", { signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`amenities file responded ${res.status}`);
  const json = (await res.json()) as { asof?: string; items?: Packed[] };
  const out: Amenity[] = [];
  for (const it of json.items ?? []) {
    const category = CAT[it.c];
    if (!category) continue;
    const d = haversineM(lat, lon, it.la, it.lo);
    if (d > AMENITY_RADIUS_M[category]) continue;
    out.push({
      category, lat: it.la, lon: it.lo,
      name: it.n ?? AMENITY_LABELS[category],
      distance_m: Math.round(d),
    });
  }
  // Nearest first, then the first PER_CATEGORY of each category; the nearest one always survives.
  const kept: Partial<Record<AmenityCategory, number>> = {};
  const items = out
    .sort((a, b) => a.distance_m - b.distance_m)
    .filter((a) => {
      const n = (kept[a.category] ?? 0) + 1;
      kept[a.category] = n;
      return n <= PER_CATEGORY;
    });
  return { items, asof: json.asof ?? null };
}
