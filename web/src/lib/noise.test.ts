// Run: npm test
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Brief, ConstructionNear } from "./brief";
import type * as Noise from "./noise";

// Loaded by URL like the ai tests; the types come from the type-only import above.
const { constructionNoise, decay, noiseLevel, noiseRank, permitWeight, COMPLAINT_CAP, NOISE_LEVELS, NOISE_PERCENTILES } =
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

/** The same, with bb_construction_near's full list of sites attached. */
function withNear(permits: [distance: number, type: string][], within250: number, within500: number): Brief {
  const b = brief([]);
  const near: ConstructionNear = {
    within_m: 500, definition: "test", sites_within_250: within250, sites_within_500: within500,
    sites: permits.map(([distance_m, type], i) => ({
      permit_num: `N${i}`, type, status: "Issued", address: `${i} Test St`, distance_m, lat: b.address.lat + i * 1e-3, lon: b.address.lon,
      est_const_cost: 2_000_000, issued_date: null, permits: 1, cite: BRIEF.construction_nearby.notable[0].cite,
    })),
  };
  return { ...b, construction_near: near };
}

test("decay follows 1 / (1 + (d/150)^2)", () => {
  assert.equal(decay(0), 1);
  assert.ok(Math.abs(decay(45) - 0.917) < 0.01);
  assert.ok(Math.abs(decay(100) - 0.692) < 0.01);
  assert.ok(Math.abs(decay(250) - 0.265) < 0.01);
  assert.ok(Math.abs(decay(500) - 0.083) < 0.01);
});

test("permit weights: new building or demolition 3, indoor work 0.5, other major work 1.5", () => {
  assert.equal(permitWeight("New Building"), 3);
  assert.equal(permitWeight("Demolition Folder (DM)"), 3);
  for (const t of ["Small Residential Projects", "Mechanical(MS)", "Plumbing(PS)", "Drain and Site Service", "Fire/Security Upgrade"]) {
    assert.equal(permitWeight(t), 0.5, t);
  }
  assert.equal(permitWeight("Building Additions/Alterations"), 1.5);
  assert.equal(permitWeight("New Houses"), 1.5);
});

test("closer and heavier work scores higher", () => {
  const raw = (p: [number, string][]) => constructionNoise(brief(p)).rawScore;
  assert.ok(raw([[45, "New Building"]]) > raw([[100, "New Building"]]));
  assert.ok(raw([[100, "New Building"]]) > raw([[100, "Building Additions/Alterations"]]));
  assert.ok(raw([[100, "Building Additions/Alterations"]]) > raw([[100, "Mechanical(MS)"]]));
  assert.equal(raw([]), 0);
});

test("the score is the raw score's rank among Toronto addresses, out of 10", () => {
  const p = NOISE_PERCENTILES;
  assert.equal(p.length, 21);
  for (let i = 1; i < p.length; i++) assert.ok(p[i] >= p[i - 1], "percentiles ascend");
  assert.equal(noiseRank(p[p.length - 1] + 100), 100);
  for (let x = 0; x <= p[p.length - 1]; x += p[p.length - 1] / 50) assert.ok(noiseRank(x + 0.01) >= noiseRank(x), `monotonic at ${x}`);
  const n = constructionNoise(brief([[45, "New Building"]]));
  assert.equal(n.score, Math.round(noiseRank(n.rawScore)) / 10);
  assert.equal(n.level, noiseLevel(n.score));
  assert.equal(noiseLevel(NOISE_LEVELS.high), "High");
  assert.equal(noiseLevel(NOISE_LEVELS.moderate), "Moderate");
  assert.equal(noiseLevel(NOISE_LEVELS.moderate - 0.1), "Low");
});

test("noise complaints are capped", () => {
  const n = constructionNoise(brief([], Array(40).fill(20)));
  assert.equal(n.parts.complaints, COMPLAINT_CAP);
  assert.equal(n.noise_complaints_within_250, 40);
});

test("without bb_construction_near, several permits on one site count as one project and counts are a floor", () => {
  const b = brief([[430, "New Building"]]);
  b.construction_nearby.notable.push({ ...b.construction_nearby.notable[0], permit_num: "T9", type: "Drain and Site Service" });
  const n = constructionNoise(b);
  assert.equal(n.major_within_500, 1);
  assert.equal(n.nearest?.type, "New Building");
  assert.equal(n.parts.permits, Math.round(3 * decay(430) * 10) / 10);
  assert.equal(constructionNoise(BRIEF).major_list_capped, true);
});

test("with bb_construction_near, counts are exact and reach 500 m", () => {
  const n = constructionNoise(withNear([[60, "New Building"], [220, "Small Residential Projects"], [480, "Demolition Folder (DM)"]], 2, 3));
  assert.equal(n.major_within_250, 2);
  assert.equal(n.major_within_500, 3);
  assert.equal(n.major_list_capped, false);
  assert.equal(n.major_reach_m, 500);
  assert.deepEqual(n.nearest && { d: n.nearest.distance_m, t: n.nearest.type }, { d: 60, t: "New Building" });
  const expected = 3 * decay(60) + 0.5 * decay(220) + 3 * decay(480);
  assert.equal(n.parts.permits, Math.round(expected * 10) / 10);
});

test("the 375 Brunswick fixture (no bb_construction_near) falls back to the brief's list", () => {
  const n = constructionNoise(BRIEF);
  assert.equal(n.nearest?.distance_m, 45);
  assert.equal(n.active_permits, BRIEF.construction_nearby.active_permit_count);
  assert.deepEqual(n.noise_period, BRIEF.service_requests_311.period);
});
