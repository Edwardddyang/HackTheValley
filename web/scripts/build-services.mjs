// Rebuilds public/services-toronto.json: parks, recreation and public-service locations from City of Toronto open
// data (CKAN), for the map's "Parks & recreation" and "Public services" layers.
// Run from web/: node scripts/build-services.mjs
//
// Sources (each item keeps the dataset it came from, for the popup):
//   Parks and Recreation Facilities          parks (with their listed amenities) and community centres
//   Air Conditioned and Cool Spaces (Heat Relief Network)   indoor and outdoor pools
//   Indoor Ice Rinks                          rinks, one per facility (pads at one centre are merged)
//   Library Branch General Information        Toronto Public Library branches with a physical location
//   Fire Station Locations, Police Facility Locations
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CKAN = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=";

async function geojson(id) {
  const pkg = await (await fetch(CKAN + id, { signal: AbortSignal.timeout(30_000) })).json();
  const res = pkg.result.resources.find((r) => /4326\.geojson$/i.test(r.name ?? ""))
    ?? pkg.result.resources.find((r) => /geojson/i.test(r.format ?? ""));
  if (!res) throw new Error(`${id}: no GeoJSON resource`);
  const gj = await (await fetch(res.url, { signal: AbortSignal.timeout(60_000) })).json();
  if (!gj.features?.length) throw new Error(`${id}: empty`);
  return gj.features;
}

/** The first point of a Point or MultiPoint, as [lon, lat]. */
function point(f) {
  const g = f.geometry;
  const c = g?.type === "MultiPoint" ? g.coordinates[0] : g?.type === "Point" ? g.coordinates : null;
  return c && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? c : null;
}

const title = (s) => String(s ?? "").toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\s+/g, " ").trim();
const clean = (s) => (s && s !== "None" ? String(s).trim() : undefined);

const items = [];
function add(c, f, name, extra = {}) {
  const pt = point(f);
  if (!pt) return;
  const it = { c, la: +pt[1].toFixed(5), lo: +pt[0].toFixed(5), n: name };
  for (const [k, v] of Object.entries(extra)) if (v) it[k] = v;
  items.push(it);
}

// Parks and community centres. Amenities are the City's list for the park (playground, dog off-leash area, …).
for (const f of await geojson("parks-and-recreation-facilities")) {
  const p = f.properties;
  const c = p.TYPE === "Park" ? "park" : p.TYPE === "Community Centre" ? "community" : null;
  if (!c) continue;
  // The City page is .../location/?id=<LOCATIONID>; the app rebuilds it from `i` (src/lib/services.ts).
  add(c, f, title(p.ASSET_NAME), { a: clean(p.ADDRESS), x: clean(p.AMENITIES), i: clean(p.LOCATIONID) });
}

// Pools from the Heat Relief Network, which lists the City's indoor and outdoor pools with addresses.
for (const f of await geojson("air-conditioned-and-cool-spaces-heat-relief-network")) {
  const p = f.properties;
  if (!/^(Indoor|Outdoor) Pool$/.test(p.locationDesc ?? "")) continue;
  add("pool", f, title(p.locationName), { a: clean(p.address), x: p.locationDesc, u: clean(p.url) });
}

// Indoor ice rinks: one entry per centre (a centre often has several pads).
const rinkSeen = new Set();
for (const f of await geojson("indoor-ice-rinks")) {
  const p = f.properties;
  const name = title(p["Parent Asset Name"] ?? p["Asset Name"]);
  if (rinkSeen.has(name)) continue;
  rinkSeen.add(name);
  add("rink", f, name);
}

for (const f of await geojson("library-branch-general-information")) {
  const p = f.properties;
  if (Number(p.PhysicalBranch) !== 1) continue;
  add("library", f, `${p.BranchName} Library`, { a: clean(p.Address)?.replace(/, Toronto, ON.*$/, ""), u: clean(p.Website) });
}

for (const f of await geojson("fire-station-locations")) {
  const p = f.properties;
  add("fire", f, `Fire Station ${p.STATION}`, { a: clean(p.ADDRESS) });
}

for (const f of await geojson("police-facility-locations")) {
  const p = f.properties;
  add("police", f, clean(p.FACILITY) ?? "Police facility", { a: clean(p.ADDRESS) });
}

const out = {
  asof: new Date().toISOString().slice(0, 10),
  source: "City of Toronto Open Data: Parks and Recreation Facilities; Air Conditioned and Cool Spaces (pools); "
    + "Indoor Ice Rinks; Toronto Public Library branches; Fire Station Locations; Police Facility Locations.",
  items,
};
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "services-toronto.json");
fs.writeFileSync(dest, JSON.stringify(out));
const per = {};
for (const i of items) per[i.c] = (per[i.c] ?? 0) + 1;
console.log("packed", items.length, "items", JSON.stringify(per), "| bytes", fs.statSync(dest).size);
