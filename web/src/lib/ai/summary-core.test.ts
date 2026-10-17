// Run: npm test (node --test src/lib/ai/)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { Brief } from "../brief";
import type { Extras } from "../extras";
import type * as SummaryCore from "./summary-core";

// Node runs .ts natively, but tsc (without allowImportingTsExtensions) rejects value imports ending in .ts, so the
// module is loaded by URL and keeps its types through the type-only import above.
const {
  buildEvidence, checkLine, citesFor, extractNumbers, groundingContext, isNumberGrounded, parseSummaryRequest,
  rentControl, summaryCacheKey, summaryResponseSchema, templateLines, templateSummary, TEMPLATE_MODEL, toSummary,
  validateSummaryOutput,
} = (await import(new URL("./summary-core.ts", import.meta.url).href)) as typeof SummaryCore;

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8"));
const BRIEF: Brief = fixture("brief-375-brunswick.json");
const EXTRAS: Extras = fixture("extras-375-brunswick.json");
const brief = (): Brief => structuredClone(BRIEF);
const extras = (): Extras => structuredClone(EXTRAS);

/** The item with this id. */
function item(set: ReturnType<typeof buildEvidence>, id: string | null | undefined) {
  const found = set.evidence.items.find((i) => i.id === id);
  assert.ok(found, `no item ${id}`);
  return found;
}

/** Template lines -> the JSON shape Gemini answers with, to run them through the same checks. */
const asModelOutput = (lines: ReturnType<typeof templateLines>) => ({
  sentences: lines.sentences.map((l) => ({ text: l.text, evidence_ids: l.ids })),
  checklist: lines.checklist.map((l) => ({ question: l.text, evidence_ids: l.ids })),
});

test("evidence: short unique ids, each mapped to the Cite it came from", () => {
  const set = buildEvidence(brief(), extras());
  const ids = set.evidence.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  ids.forEach((id, n) => assert.equal(id, `f${n + 1}`));
  for (const id of ids) {
    assert.ok(set.cites.get(id), `cite for ${id}`);
    assert.ok(set.topics.get(id), `topic for ${id}`);
  }
  assert.equal(set.cites.size, ids.length);
  assert.equal(set.evidence.address, "375 Brunswick Ave");

  // Single-row facts keep the cite bb_brief returned.
  assert.deepEqual(set.cites.get(set.refs.latest!), BRIEF.building.in_rentsafe && BRIEF.building.latest_evaluation.cite);
  assert.deepEqual(set.cites.get(set.refs.registration!), EXTRAS.registration?.cite);
  assert.deepEqual(set.cites.get(set.refs.rent!), EXTRAS.rent_benchmark?.cite);
  // Totals without a cite of their own get an aggregate cite over their rows.
  assert.deepEqual(set.cites.get(set.refs.sr311_nearby!), {
    dataset: "service_requests_311", file: "sr2026.zip", row_count: 328,
    sample_rows: BRIEF.service_requests_311.nearby.points.slice(0, 5).map((p) => p.row),
  });
  const dev = set.cites.get(set.refs.dev_counts!.id);
  assert.ok(dev && "row_count" in dev && dev.row_count === 16 && dev.dataset === "development_applications");
});

test("evidence covers the building, registration, rents, nearby change, 311, crime and census", () => {
  const set = buildEvidence(brief(), extras());
  const building = item(set, set.refs.latest).facts;
  assert.equal(building.score, 70);
  assert.equal(building.evaluated_on, "2025-10-02");
  assert.equal(building.percent_of_toronto_buildings_scoring_lower, 0.9);
  assert.equal(building.year_built, 1960);
  assert.match(String(building.rent_control), /^likely covered/);
  assert.deepEqual((building.lowest_graded_items as string[])[0], "Balcony guards: 1 of 3");
  assert.deepEqual(set.refs.previous, { id: set.refs.previous?.id, date: "2023-10-04", score: 81 });

  const reg = item(set, set.refs.registration).facts;
  assert.equal(reg.air_conditioning, "none");
  assert.equal(reg.has_cooling_room, false);
  assert.equal(reg.heating_type, "hot water");
  assert.equal("property_manager" in reg, false, "nulls are dropped, not sent as null");

  const rent = item(set, set.refs.rent).facts as { vacant_units: Record<string, number>; all_units: Record<string, number> };
  assert.equal(rent.vacant_units.one_bedroom, 2092);
  assert.equal("three_plus_bedroom" in rent.vacant_units, false);
  assert.equal(rent.all_units.three_plus_bedroom, 3195);

  assert.equal(item(set, set.refs.construction).facts.active_permits, 864);
  assert.equal(set.refs.nearest_notable?.permit.address, "385 BRUNSWICK AVE");
  assert.deepEqual(item(set, set.refs.dev_counts?.id).facts, { radius_m: 500, in_review: 10, approved: 6 });
  assert.equal(set.refs.dev_nearest?.app.distance_m, Math.min(...BRIEF.development_applications.open.map((a) => a.distance_m)));

  for (const id of [set.refs.sr311_nearby, set.refs.sr311_ward]) assert.match(item(set, id).about, /not this building/);
  assert.equal(item(set, set.refs.sr311_ward).facts.requests, 23632);

  const crime = item(set, set.refs.crime);
  assert.match(crime.about, /Annex neighbourhood in 2025.*not this building/);
  assert.equal(crime.facts.offence_types_compared, 9);
  assert.deepEqual((crime.facts.offences as Record<string, Record<string, number>>).Assault, {
    rate_per_100k: 1080.9, toronto_rate_per_100k: 767.9, incidents: 416, previous_year_rate_per_100k: 1192.4,
  });

  assert.deepEqual(item(set, set.refs.census.renter_households).facts, {
    measure: "Households that rent (%)", value: 59.1, toronto_neighbourhood_median: 45.5,
  });
  const nearby = set.refs.rentsafe_nearby;
  assert.ok(nearby && nearby.buildings > 0 && nearby.higher != null && nearby.lower != null);
  assert.ok(nearby.higher + nearby.lower <= nearby.buildings);
});

test("extractNumbers normalises separators, decimals and dates, and skips codes", () => {
  assert.deepEqual(extractNumbers("1,200 and 1200"), [1200, 1200]);
  assert.deepEqual(extractNumbers("asking $2,350/month"), [2350]);
  assert.deepEqual(extractNumbers("scored 70/100"), [70, 100]);
  assert.deepEqual(extractNumbers("on 2025-10-02"), [2025, 10, 2]);
  assert.deepEqual(extractNumbers("median 18.0, ward 88.1"), [18, 88.1]);
  assert.deepEqual(extractNumbers("postal area M5R, evidence f12"), []);
});

test("isNumberGrounded accepts exact and rounded values only", () => {
  const allowed = [88.1, 193.5, 1225, 18];
  for (const n of [1225, 88, 194, 193, 18]) assert.equal(isNumberGrounded(n, allowed), true, String(n));
  for (const n of [19, 1200, 89]) assert.equal(isNumberGrounded(n, allowed), false, String(n));
});

test("validateSummaryOutput drops unknown ids, uncited lines and numbers the cited items don't have", () => {
  const set = buildEvidence(brief(), extras());
  const ctx = groundingContext(set);
  const { latest, registration, crime } = set.refs;
  const result = validateSummaryOutput({
    sentences: [
      { text: "375 Brunswick Ave scored 70/100 on its latest RentSafeTO evaluation.", evidence_ids: [latest] },
      // The unknown id is dropped and the real one kept.
      { text: "The registration lists hot water heating.", evidence_ids: ["f999", registration] },
      { text: "Only a made-up citation.", evidence_ids: ["f999"] },
      { text: "No citation at all.", evidence_ids: [] },
      // 71 is not in the evidence.
      { text: "375 Brunswick Ave scored 71/100.", evidence_ids: [latest] },
      // 2,092 is a CMHC rent, but the line only cites the building.
      { text: "A one-bedroom here rents for $2,092.", evidence_ids: [latest] },
      // Inline citations and bullets are stripped; duplicates dropped.
      { text: "- It was built in 1960 [f4].", evidence_ids: [latest] },
      { text: "It was built in 1960.", evidence_ids: [latest] },
      "not an object",
    ],
    checklist: [
      { question: "What has been fixed since the evaluation on 2025-10-02?", evidence_ids: [latest] },
      { question: "Is assault common in the Annex?", evidence_ids: [crime] },
      { question: "Will the rent go up to $4,100 next year?", evidence_ids: [latest] },
    ],
  }, ctx);
  assert.deepEqual(result.sentences.map((s) => s.text), [
    "375 Brunswick Ave scored 70/100 on its latest RentSafeTO evaluation.",
    "The registration lists hot water heating.",
    "It was built in 1960.",
  ]);
  assert.deepEqual(result.sentences[1].ids, [registration]);
  assert.equal(result.checklist.length, 2);
  const reasons = result.rejected.map((r) => r.reason);
  assert.equal(reasons.filter((r) => r === "no valid citation").length, 2);
  assert.ok(reasons.includes("number 71 is not in the cited evidence"));
  assert.ok(reasons.includes("number 2092 is not in the cited evidence"));
  assert.ok(reasons.includes("number 4100 is not in the cited evidence"));

  // Ids come back as the Cite objects of the rows they stand for.
  const summary = toSummary(result, set.cites, "gemini-test", new Date("2026-10-17T12:00:00Z"));
  assert.deepEqual(summary.sentences[1].cites, [EXTRAS.registration?.cite]);
  assert.equal(summary.model, "gemini-test");
  assert.equal(summary.generated_at, "2026-10-17T12:00:00.000Z");
});

test("checkLine keeps 311, crime and conditions off the building", () => {
  const b = brief();
  if (b.building.in_rentsafe) b.building.latest_evaluation.lowest_items![0] = { item: "PEST CONTROL", score: 1 };
  const set = buildEvidence(b, extras());
  const ctx = groundingContext(set);
  const { sr311_nearby: nearby, sr311_ward: ward, crime, latest, construction } = set.refs;
  const ok = (text: string, ids: (string | null)[]) => checkLine(text, ids as string[], ctx, 350);

  assert.equal(ok("311 logged 328 requests at intersections within 500 m.", [nearby]), null);
  assert.equal(ok("311 logged 328 requests within 500 m, not at this building.", [nearby]), null);
  assert.match(ok("311 logged 328 complaints at this building.", [nearby]) ?? "", /311 requests to the building/);
  assert.match(ok("Ward 11 had 23,632 requests about the building.", [ward]) ?? "", /311 requests to the building/);
  assert.match(ok("Most of the 23,632 requests in Ward 11 were resolved.", [ward]) ?? "", /resolution/);

  assert.equal(ok("In the Annex, the assault rate was 1,080.9 per 100,000 people in 2025.", [crime]), null);
  assert.match(ok("The building had 416 assaults in 2025.", [crime]) ?? "", /crime to the building/);
  assert.match(ok("Break-ins are common around here.", [latest]) ?? "", /without a crime record/);

  // "Pest control" is an evaluation item of this building, so the line may mention pests when it cites that item.
  assert.equal(ok("Pest control was graded 1 of 3.", [latest]), null);
  assert.match(ok("Expect pests in the building.", [construction]) ?? "", /pests without a record/);
  assert.match(ok("The units have mould.", [latest]) ?? "", /mould without a record/);
});

test("templateSummary on 375 Brunswick: cited, grounded, within limits", () => {
  const summary = templateSummary(brief(), extras(), new Date("2026-10-17T12:00:00Z"));
  assert.equal(summary.model, TEMPLATE_MODEL);
  assert.equal(summary.generated_at, "2026-10-17T12:00:00.000Z");
  assert.ok(summary.sentences.length >= 4 && summary.sentences.length <= 7, `sentences: ${summary.sentences.length}`);
  assert.ok(summary.checklist.length >= 3 && summary.checklist.length <= 6, `checklist: ${summary.checklist.length}`);
  for (const line of [...summary.sentences, ...summary.checklist]) {
    assert.ok(line.cites.length > 0, line.text);
    for (const c of line.cites) assert.ok(c.dataset && c.file, line.text);
  }
  const texts = summary.sentences.map((s) => s.text);
  assert.equal(texts[0],
    "375 Brunswick Ave scored 70/100 on its latest RentSafeTO evaluation (Oct 2, 2025), down from 81 in Oct 2023; 0.9% of evaluated Toronto buildings score lower.");
  assert.ok(texts.some((t) => /likely covered/.test(t) && /confirm with the landlord/.test(t)));
  assert.ok(texts.some((t) => /no air conditioning or cooling room/.test(t)));
  assert.ok(texts.some((t) => /vacant purpose-built rentals .* \$2,092 for one bedroom/.test(t)));
  assert.ok(summary.checklist.some((q) => /balcony guards 1 of 3/.test(q.text)));

  // The template passes the same checks as Gemini's answer, with nothing dropped.
  const set = buildEvidence(brief(), extras());
  const checked = validateSummaryOutput(asModelOutput(templateLines(brief(), extras(), set)), groundingContext(set));
  assert.deepEqual(checked.rejected, []);
  assert.equal(checked.sentences.length, summary.sentences.length);
  assert.equal(checked.checklist.length, summary.checklist.length);
});

test("templateSummary without extras, without RentSafeTO, and for a newer building", () => {
  const check = (b: Brief, x: Extras | null) => {
    const set = buildEvidence(b, x);
    const lines = templateLines(b, x, set);
    assert.deepEqual(validateSummaryOutput(asModelOutput(lines), groundingContext(set)).rejected, []);
    for (const l of [...lines.sentences, ...lines.checklist]) assert.ok(l.ids.length > 0, l.text);
    return lines.sentences.map((s) => s.text);
  };

  const noExtras = check(brief(), null);
  assert.ok(noExtras.length >= 4);
  assert.ok(!noExtras.some((t) => /CMHC|registration/.test(t)));

  const house = brief();
  house.building = { in_rentsafe: false, note: "No RentSafeTO evaluation with this exact address." };
  const houseLines = check(house, { registration: null, rent_benchmark: EXTRAS.rent_benchmark });
  assert.match(houseLines[0], /^375 Brunswick Ave has no RentSafeTO evaluation; RentSafeTO only covers/);
  assert.ok(houseLines.some((t) => /311 logged/.test(t) && /not this building/.test(t)));
  assert.ok(houseLines.some((t) => /offence types reported by Toronto Police/.test(t)));

  const newer = brief();
  if (newer.building.in_rentsafe) newer.building.year_built = 2021;
  assert.ok(check(newer, extras()).some((t) => /likely exempt/.test(t) && /Nov 15, 2018/.test(t)));
  assert.equal(rentControl(2018), "unknown");
  assert.equal(rentControl(null), "unknown");

  const bare = brief();
  bare.building = { in_rentsafe: false, note: "No RentSafeTO evaluation with this exact address." };
  bare.area = { neighbourhood: null, ward: null };
  bare.rentsafe_nearby.buildings = [];
  bare.permits_at_address.items = [];
  bare.construction_nearby = { ...bare.construction_nearby, active_permit_count: 0, by_type: [], notable: [], cite: null };
  bare.development_applications = { counts: null, type_labels: {}, open: [] };
  bare.service_requests_311 = {
    period: { from: null, to: null },
    nearby: { note: "", count: 0, top_types: [], points: [] },
    ward: { ward_number: null, count: 0, top_types: [] },
  };
  bare.crime = { ...bare.crime, offences: [] };
  bare.census = { ...bare.census, values: null };
  const empty = templateSummary(bare, null);
  assert.equal(empty.model, TEMPLATE_MODEL);
  assert.equal(empty.sentences.length, 1);
  assert.ok(empty.checklist.length >= 1);
});

test("response schema limits citations to the evidence ids", () => {
  const set = buildEvidence(brief(), extras());
  const ids = set.evidence.items.map((i) => i.id);
  const schema = summaryResponseSchema(ids);
  assert.deepEqual(schema.properties.sentences.items.properties.evidence_ids.items.enum, ids);
  assert.deepEqual(schema.required, ["sentences", "checklist"]);
});

test("citesFor drops unknown ids and duplicate cites", () => {
  const set = buildEvidence(brief(), extras());
  const crime = set.refs.crime!;
  // Every census value has its own row, so two census ids give two cites; the same id twice gives one.
  assert.equal(citesFor([crime, crime, "f999"], set.cites).length, 1);
  assert.equal(citesFor(Object.values(set.refs.census).slice(0, 2), set.cites).length, 2);
});

test("parseSummaryRequest and summaryCacheKey", () => {
  const limits = { min: 100, max: 1000, default: 500 };
  assert.deepEqual(parseSummaryRequest({ address_point_id: 778448 }, limits), {
    ok: true, value: { address_point_id: 778448, radius_m: 500 },
  });
  assert.deepEqual(parseSummaryRequest({ address_point_id: 7, radius_m: 250 }, limits), {
    ok: true, value: { address_point_id: 7, radius_m: 250 },
  });
  for (const bad of [null, [], {}, { address_point_id: "778448" }, { address_point_id: -1 }, { address_point_id: 1.5 },
    { address_point_id: 7, radius_m: 50 }, { address_point_id: 7, radius_m: 2000 }, { address_point_id: 7, radius_m: "500" }]) {
    assert.equal(parseSummaryRequest(bad, limits).ok, false, JSON.stringify(bad));
  }
  assert.equal(summaryCacheKey({ address_point_id: 778448, radius_m: 500 }), "778448:500");
});
