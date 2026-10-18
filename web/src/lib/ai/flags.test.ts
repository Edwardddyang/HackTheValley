// The computed What-to-flag list (lib/flags.ts) on the saved 375 Brunswick Ave brief.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Brief } from "../brief";
import type { Extras } from "../extras";
import type * as Flags from "../flags";

const { computeFlags, aboveText, MAX_FLAGS } =
  (await import(new URL("../flags.ts", import.meta.url).href)) as typeof Flags;

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"));
const BRIEF: Brief = fixture("brief-375-brunswick.json");
const EXTRAS: Extras = fixture("extras-375-brunswick.json");
const STATS = { median_score: 92, buildings: 3500, scoring: "2023+" as const, note: "" };

test("375 Brunswick: the low score leads, with its figure and cite", () => {
  const flags = computeFlags(BRIEF, EXTRAS, STATS, { rent: null, beds: null });
  assert.ok(flags.length > 0 && flags.length <= MAX_FLAGS);
  const first = flags[0];
  assert.equal(first.key, "score");
  assert.match(first.headline, /^Inspection score 70\/100, in the bottom 1% of Toronto buildings$/);
  assert.equal(first.figure.kind, "score");
  if (first.figure.kind === "score") assert.equal(first.figure.median, 92);
  for (const f of flags) assert.ok(f.cites.length > 0, `${f.key} has a source`);
});

test("a pasted rent well above the vacant-unit average is flagged with both numbers", () => {
  const flags = computeFlags(BRIEF, EXTRAS, STATS, { rent: 2350, beds: 1 });
  const rent = flags.find((f) => f.key === "rent");
  assert.ok(rent, "rent flag present");
  assert.match(rent.headline, /Asking \$2,350, 12% above the area average for a 1-bedroom/);
  assert.equal(rent.figure.kind, "compare");
  if (rent.figure.kind === "compare") {
    assert.equal(rent.figure.mine.value, 2350);
    assert.equal(rent.figure.other.value, 2092);
  }
});

test("a rent at or below the average is not flagged", () => {
  const flags = computeFlags(BRIEF, EXTRAS, STATS, { rent: 2000, beds: 1 });
  assert.equal(flags.find((f) => f.key === "rent"), undefined);
});

test("aboveText switches from percent to a multiple at 1.5x", () => {
  assert.equal(aboveText(1080.9, 767.9, "Toronto's"), "41% above Toronto's");
  assert.equal(aboveText(3.9, 1.4, "Toronto's"), "2.8× Toronto's");
});

test("a building outside RentSafeTO with nothing standing out yields no score flag", () => {
  const brief: Brief = { ...BRIEF, building: { in_rentsafe: false, note: "" } };
  assert.equal(computeFlags(brief, null, STATS, { rent: null, beds: null }).find((f) => f.key === "score"), undefined);
});
