// Rebuilds public/hoods-toronto.json for the choropleth: boundaries from City of Toronto open
// data (CKAN), per-hood values from this project's Supabase (anon-readable open data). RentSafeTO
// buildings are placed in neighbourhoods here, by point-in-polygon on the full boundaries.
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

// Profile rows are looked up by label (server-side filter: the variables table is larger than
// PostgREST's 1000-row default page); topic disambiguates labels that repeat.
async function profileVar(variable, topicRe) {
  const vars = await sb(`neighbourhood_profile_variables?select=row_number,topic,variable&variable=eq.${encodeURIComponent(variable)}`);
  const v = vars.find((x) => topicRe.test(x.topic ?? "")) ?? vars[0];
  if (!v) throw new Error(`profile variable not found: ${variable}`);
  return v.row_number;
}
async function profileValues(row) {
  const rows = await sb(`neighbourhood_profiles?select=hood_id,value_num&row_number=eq.${row}`);
  return Object.fromEntries(rows.map((r) => [r.hood_id, r.value_num == null ? null : +r.value_num]));
}
async function crimeRate(offence) {
  const rows = await sb(`crime_rates?select=hood_id,rate_per_100k&offence=eq.${offence}&year=eq.2025`);
  return Object.fromEntries(rows.map((r) => [r.hood_id, r.rate_per_100k == null ? null : +r.rate_per_100k]));
}

const rent = await profileValues(await profileVar("Median monthly shelter costs for rented dwellings ($)", /Tenant households/));
// Already a percentage in the profile (tenant households with income > 0).
const burden = await profileValues(await profileVar("% of tenant households spending 30% or more of its income on shelter costs", /Tenant households/));
const commuteTopic = /Main mode of commuting/;
const commuters = await profileValues(await profileVar(
  "Total - Main mode of commuting for the employed labour force aged 15 years and over with a usual place of work or no fixed workplace address - 25% sample data", commuteTopic));
const transitCount = await profileValues(await profileVar("Public transit", commuteTopic));
const transit = Object.fromEntries(Object.entries(transitCount).map(([id, n]) =>
  [id, n != null && commuters[id] ? +((100 * n) / commuters[id]).toFixed(1) : null]));
const assault = await crimeRate("ASSAULT");
const bne = await crimeRate("BREAKENTER");

// Each RentSafeTO building's latest evaluation under the 2023+ scoring (older scores aren't comparable),
// paged past PostgREST's 1000-row cap.
const buildings = [];
for (let from = 0; ; from += 1000) {
  const page = await sb(`rentsafe_evaluations?select=rsn,score,geom&is_latest=eq.true&schema_version=eq.${encodeURIComponent("2023+")}&score=not.is.null&order=rsn&offset=${from}&limit=1000`);
  buildings.push(...page.filter((b) => b.geom?.coordinates));
  if (page.length < 1000) break;
}
const pkg = await (await fetch("https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=neighbourhoods")).json();
const resource = pkg.result.resources.find((r) => /4326\.geojson$/i.test(r.url ?? "") || (/geojson/i.test(r.format ?? "") && /4326/.test(r.name ?? "")));
if (!resource) throw new Error("no 4326 geojson resource");
const gj = await (await fetch(resource.url)).json();

// Ray casting on the full-resolution boundary (holes count as outside).
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeom(pt, geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  return polys.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
// A median of one or two buildings says more about those buildings than the area.
const MIN_BUILDINGS = 3;

const features = [];
let placed = 0;
for (const f of gj.features ?? []) {
  const hood_id = parseInt(f.properties.AREA_SHORT_CODE, 10);
  if (!Number.isFinite(hood_id)) continue;
  const scores = buildings.filter((b) => inGeom(b.geom.coordinates, f.geometry)).map((b) => +b.score);
  placed += scores.length;
  features.push({
    type: "Feature",
    geometry: simplifyGeom(f.geometry),
    properties: {
      id: hood_id, name: f.properties.AREA_NAME,
      rent: rent[hood_id] ?? null, burden: burden[hood_id] ?? null, transit: transit[hood_id] ?? null,
      assault: assault[hood_id] ?? null, bne: bne[hood_id] ?? null,
      rentsafe: scores.length >= MIN_BUILDINGS ? median(scores) : null, rentsafe_n: scores.length,
    },
  });
}
if (features.length < 150) throw new Error(`only ${features.length} hoods`);

const METRICS = ["rent", "burden", "transit", "assault", "bne", "rentsafe"];
const domains = {};
for (const m of METRICS) {
  const vs = features.map((f) => f.properties[m]).filter((v) => v != null).sort((a, b) => a - b);
  if (vs.length < 100) throw new Error(`${m}: only ${vs.length} hoods have a value`);
  domains[m] = [pct(vs, 0.05), pct(vs, 0.95)];
}
const out = {
  asof: new Date().toISOString().slice(0, 10),
  source: "Boundaries: City of Toronto Open Data (Neighbourhoods, 158 model). Values: 2021 Census Neighbourhood Profiles "
    + "(renters' median shelter cost, tenant households spending 30%+ of income on shelter, main commute mode); "
    + "Toronto Police neighbourhood crime rates (assault, break and enter, 2025); RentSafeTO (median of each building's "
    + `latest 2023+ evaluation, neighbourhoods with ${MIN_BUILDINGS}+ buildings).`,
  domains,
  fc: { type: "FeatureCollection", features },
};
const dest = path.join(webDir, "public", "hoods-toronto.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log("hoods:", features.length, "| rentsafe buildings placed:", placed, "of", buildings.length, "| domains:", JSON.stringify(out.domains), "| bytes:", fs.statSync(dest).size);
