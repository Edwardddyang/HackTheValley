// Calibrates the construction & noise score against Toronto: scores a fixed random sample of address points
// (scripts/noise-sample-ids.json) with the app's own code and prints the raw score at each percentile, to paste
// into NOISE_PERCENTILES in src/lib/noise.ts. Re-run after the permits or 311 data are reloaded.
// Run from web/: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/calibrate-noise.mjs
// (reads web/.env.local; prints no secret values)
//
// The sample is 400 address points drawn in the database with
//   select address_point_id from address_points tablesample bernoulli (0.1) repeatable (42) limit 400;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const { constructionNoise } = await import(new URL("../src/lib/noise.ts", import.meta.url).href);
const envFile = fs.readFileSync(path.join(webDir, ".env.local"), "utf8");
const env = (name) => {
  const m = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!m) throw new Error(`${name} not in web/.env.local`);
  return m[1].trim().replace(/\r/g, "");
};
const SB = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const KEY = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

async function rpc(fn, body) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${SB}/rest/v1/rpc/${fn}`, {
      method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    }).catch(() => null); // a timeout or network error counts as a failed attempt
    if (res?.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

const ids = JSON.parse(fs.readFileSync(path.join(webDir, "scripts", "noise-sample-ids.json"), "utf8"));
const scores = [];
for (let i = 0; i < ids.length; i += 8) {
  if (i % 80 === 0) console.error(`${i} / ${ids.length}`);
  await Promise.all(ids.slice(i, i + 8).map(async (id) => {
    const [brief, near] = await Promise.all([
      rpc("bb_brief", { p_address_point_id: id, p_radius_m: 500 }),
      rpc("bb_construction_near", { p_address_point_id: id }),
    ]);
    if (brief?.address && near) scores.push(constructionNoise({ ...brief, construction_near: near }).rawScore);
  }));
}
scores.sort((a, b) => a - b);
const at = (p) => scores[Math.round((p / 100) * (scores.length - 1))];
console.log(`${scores.length} of ${ids.length} addresses scored`);
console.log(`NOISE_PERCENTILES = [${Array.from({ length: 21 }, (_, i) => at(i * 5)).join(", ")}]`);
