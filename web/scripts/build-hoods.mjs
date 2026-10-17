// Rebuilds public/hoods-toronto.json for the choropleth: boundaries from City of Toronto open
// data (CKAN), per-hood values from this project's Supabase (anon-readable open data).
// Run from web/: node scripts/build-hoods.mjs   (reads web/.env.local; prints no secret values)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = fs.readFileSync(path.join(webDir, ".env.local"), "utf8");

function env(name) {
  const m = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} not in web/.env.local`);
  return m[1].trim().replace(/\r/g, "");
}

const SB = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const KEY = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

async function sb(q) {
  const res = await fetch(`${SB}/rest/v1/${q}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${q.split("?")[0]} -> ${res.status}`);
  return res.json();
}

// Radial-distance simplification (~20 m): plenty for a tinted area layer.
const TOL = 2.2e-4;
function simplifyRing(ring) {
  const out = [ring[0]];
  for (const p of ring.slice(1)) {
    const q = out[out.length - 1];
    if (Math.abs(p[0] - q[0]) > TOL || Math.abs(p[1] - q[1]) > TOL) out.push(p);
  }
  out.push(ring[ring.length - 1]);
  return out.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}
function simplifyGeom(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const simped = polys.map((rings) => rings.map(simplifyRing).filter((r) => r.length >= 4));
  return { type: "MultiPolygon", coordinates: simped.filter((p) => p.length) };
}
const pct = (sorted, p) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.round(p * (sorted.length - 1))))];

// The row that holds median monthly shelter cost for renters (server-side filter: the
// variables table is larger than PostgREST's 1000-row default page).
const vars = await sb(`neighbourhood_profile_variables?select=row_number,topic,variable&variable=eq.${encodeURIComponent("Median monthly shelter costs for rented dwellings ($)")}`);
const rentVar = vars.find((v) => v.topic === "Total - Tenant households") ?? vars[0];
if (!rentVar) throw new Error("rent variable not found");

const rentRows = await sb(`neighbourhood_profiles?select=hood_id,value_num&row_number=eq.${rentVar.row_number}`);
const crimeRows = await sb("crime_rates?select=hood_id,rate_per_100k&offence=eq.ASSAULT&year=eq.2025");
const rent = Object.fromEntries(rentRows.map((r) => [r.hood_id, r.value_num == null ? null : +r.value_num]));
const assault = Object.fromEntries(crimeRows.map((r) => [r.hood_id, r.rate_per_100k == null ? null : +r.rate_per_100k]));

const pkg = await (await fetch("https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=neighbourhoods")).json();
const resource = pkg.result.resources.find((r) => /4326\.geojson$/i.test(r.url ?? "") || (/geojson/i.test(r.format ?? "") && /4326/.test(r.name ?? "")));
if (!resource) throw new Error("no 4326 geojson resource");
const gj = await (await fetch(resource.url)).json();

const features = [];
for (const f of gj.features ?? []) {
  const hood_id = parseInt(f.properties.AREA_SHORT_CODE, 10);
  if (!Number.isFinite(hood_id)) continue;
  features.push({
    type: "Feature",
    geometry: simplifyGeom(f.geometry),
    properties: { id: hood_id, name: f.properties.AREA_NAME, rent: rent[hood_id] ?? null, assault: assault[hood_id] ?? null },
  });
}
if (features.length < 150) throw new Error(`only ${features.length} hoods`);

const rs = features.map((f) => f.properties.rent).filter((v) => v != null).sort((a, b) => a - b);
const as = features.map((f) => f.properties.assault).filter((v) => v != null).sort((a, b) => a - b);
const out = {
  asof: new Date().toISOString().slice(0, 10),
  source: "Boundaries: City of Toronto Open Data (Neighbourhoods, 158 model). Values: 2021 Census Neighbourhood Profiles; Toronto Police crime rates (assault, 2025).",
  domains: { rent: [pct(rs, 0.05), pct(rs, 0.95)], assault: [pct(as, 0.05), pct(as, 0.95)] },
  fc: { type: "FeatureCollection", features },
};
const dest = path.join(webDir, "public", "hoods-toronto.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log("hoods:", features.length, "| domains:", JSON.stringify(out.domains), "| bytes:", fs.statSync(dest).size);
