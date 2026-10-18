// Run: npm test
import assert from "node:assert/strict";
import { test } from "node:test";

import type * as Geo from "./geo";

const { mergeNearbyDuplicates } = (await import(new URL("./geo.ts", import.meta.url).href)) as typeof Geo;

const at = (id: number, address: string, municipality: string, lat: number, lon: number) => ({ id, address, municipality, lat, lon });

test("merges the lot and entrance points of one address, keeping the first", () => {
  const out = mergeNearbyDuplicates([
    at(1, "96 Churchill Ave", "North York", 43.77196, -79.42126),
    at(2, "96 Churchill Ave", "North York", 43.77205, -79.42122),
    at(3, "96 Church Ave", "North York", 43.7721, -79.4113),
  ]);
  assert.deepEqual(out.map((m) => m.id), [1, 3]);
});

test("keeps the same address when it is far apart or in another municipality", () => {
  const out = mergeNearbyDuplicates([
    at(1, "10 Main St", "Scarborough", 43.7, -79.3),
    at(2, "10 main st", "Scarborough", 43.71, -79.3),
    at(3, "10 Main St", "Etobicoke", 43.7, -79.3),
  ]);
  assert.deepEqual(out.map((m) => m.id), [1, 2, 3]);
});
