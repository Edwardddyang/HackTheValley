// Rebuilds public/amenities-toronto.json from OpenStreetMap via the Overpass API.
// Run from web/: node scripts/build-amenities.mjs
// Categories: subway stations (either station=subway or subway=yes tagging), supermarkets and
// greengrocers, pharmacies, and hospitals WITH an emergency room (emergency=yes) — rehab and
// complex-care sites would otherwise show up as the "nearest hospital".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BBOX = "43.58,-79.64,43.86,-79.11"; // Toronto
const QUERY = `[out:json][timeout:90];(
node(${BBOX})[railway=station][station=subway];
node(${BBOX})[railway=station][subway=yes];
nwr(${BBOX})[shop~"^(supermarket|greengrocer)$"];
nwr(${BBOX})[amenity=pharmacy];
nwr(${BBOX})[amenity=hospital][emergency=yes];
);out center;`;

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function categorize(t) {
  if (!t) return null;
  if (t.railway === "station" && (t.station === "subway" || t.subway === "yes")) return "s";
  if (t.shop === "supermarket" || t.shop === "greengrocer") return "g";
  if (t.amenity === "pharmacy" || t.healthcare === "pharmacy") return "p";
  if (t.amenity === "hospital") return "h";
  return null;
}

async function download() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": "ReadReceipt-hackathon/1.0" },
          body: new URLSearchParams({ data: QUERY }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        const json = await res.json();
        if (!json.elements?.length) throw new Error(`${url} -> empty`);
        return json;
      } catch (err) {
        console.error(`attempt ${attempt}: ${err.message ?? err}`);
      }
    }
    await new Promise((r) => setTimeout(r, 20_000));
  }
  throw new Error("all Overpass attempts failed");
}

const raw = await download();
const seen = new Set();
const items = [];
for (const el of raw.elements ?? []) {
  const c = categorize(el.tags);
  const la = el.lat ?? el.center?.lat;
  const lo = el.lon ?? el.center?.lon;
  if (!c || la == null || lo == null) continue;
  const n = el.tags?.name;
  // A place mapped as both a node and a building way shows up twice; name + ~100 m grid
  // drops the duplicate.
  const key = `${c}|${n ?? ""}|${la.toFixed(3)},${lo.toFixed(3)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const it = { c, la: +la.toFixed(5), lo: +lo.toFixed(5) };
  if (n) it.n = n;
  items.push(it);
}

const out = {
  asof: new Date().toISOString().slice(0, 10),
  source: "OpenStreetMap (Overpass API); hospitals limited to emergency=yes",
  items,
};
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "amenities-toronto.json");
fs.writeFileSync(dest, JSON.stringify(out));
const perCat = {};
for (const i of items) perCat[i.c] = (perCat[i.c] ?? 0) + 1;
console.log("packed", items.length, "items", JSON.stringify(perCat), "->", dest);
