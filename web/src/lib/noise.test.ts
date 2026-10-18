// Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Brief } from "./brief";
import type * as Noise from "./noise";

// Loaded by URL like the ai tests; the types come from the type-only import above.
const { constructionNoise, decay, noiseLevel, COMPLAINT_CAP } =
  (await import(new URL("./noise.ts", import.meta.url).href)) as typeof Noise;

const BRIEF: Brief = JSON.parse(readFileSync(new URL("../fixtures/brief-375-brunswick.json", import.meta.url), "utf8"));

type Permit = Brief["construction_nearby"]["notable"][number];
type Point311 = Brief["service_requests_311"]["nearby"]["points"][number];

/** 375 Brunswick with its permits and 311 points replaced. Points are placed due north of the address. */
function brief(permits: [distance: number, type: string][], complaints: number[] = []): Brief {
  const b = structuredClone(BRIEF);
  const north = (d: number) => b.address.lat + d / 111_195;
  b.construction_nearby.notable = permits.map(([distance_m, type], i): Permit => ({
    ...BRIEF.construction_nearby.notable[0], permit_num: `T${i}`, type, distance_m, lat: north(distance_m) + i * 1e-4, lon: b.address.lon,
  }));
  b.service_requests_311.nearby.points = complaints.map((d, i): Point311 => ({
    lat: north(d), lon: b.address.lon, type: "Unreasonable and Persistent Noise", status: "Completed", date: "2026-09-01", row: i,
  }));
  return b;
}

test("decay follows 1 / (1 + (d/150)^2)", () => {
  assert.equal(decay(0), 1);
  assert.ok(Math.abs(decay(45) - 0.917) < 0.01);
  assert.ok(Math.abs(decay(100) - 0.692) < 0.01);
  assert.ok(Math.abs(decay(250) - 0.265) < 0.01);
  assert.ok(Math.abs(decay(500) - 0.083) < 0.01);
});

test("sanity targets for the level cutoffs", () => {
  assert.equal(constructionNoise(brief([])).level, "Low");
  assert.equal(constructionNoise(brief([[100, "New Building"]])).level, "Moderate");
  assert.equal(constructionNoise(brief([[45, "New Building"]])).level, "Moderate");
  assert.equal(constructionNoise(brief([[45, "New Building"], [150, "Building Additions/Alterations"]])).level, "High");
  assert.equal(constructionNoise(brief([[150, "New Building"], [150, "Demolition Folder (DM)"]])).level, "High");
  assert.equal(constructionNoise(brief([[400, "Building Additions/Alterations"], [450, "New Houses"]])).level, "Low");
});

test("noise complaints are capped and cannot make the level High alone", () => {
  const n = constructionNoise(brief([], Array(40).fill(20)));
  assert.equal(n.parts.complaints, COMPLAINT_CAP);
  assert.notEqual(n.level, "High");
  assert.equal(n.noise_complaints_within_250, 40);
});

test("several permits on one site count as one project", () => {
  const b = brief([[430, "New Building"]]);
  b.construction_nearby.notable.push({ ...b.construction_nearby.notable[0], permit_num: "T9", type: "Drain and Site Service" });
  const n = constructionNoise(b);
  assert.equal(n.major_within_500, 1);
  assert.equal(n.nearest?.type, "New Building");
  assert.equal(n.parts.permits, Math.round(3 * decay(430) * 10) / 10);
});

test("counts by distance and the nearest project", () => {
  const n = constructionNoise(brief([[45, "New Building"], [220, "Building Additions/Alterations"], [480, "Demolition Folder (DM)"]], [100, 300]));
  assert.equal(n.major_within_250, 2);
  assert.equal(n.major_within_500, 3);
  assert.deepEqual(n.nearest && { d: n.nearest.distance_m, t: n.nearest.type }, { d: 45, t: "New Building" });
  assert.equal(n.noise_complaints_within_250, 1);
  assert.equal(n.noise_complaints_within_radius, 2);
  assert.equal(n.major_list_capped, false);
});

test("the 375 Brunswick fixture is High (a new building 45 m away)", () => {
  const n = constructionNoise(BRIEF);
  assert.equal(n.level, "High");
  assert.equal(n.nearest?.distance_m, 45);
  assert.equal(n.active_permits, BRIEF.construction_nearby.active_permit_count);
  assert.deepEqual(n.noise_period, BRIEF.service_requests_311.period);
  assert.equal(noiseLevel(n.score), n.level);
});
