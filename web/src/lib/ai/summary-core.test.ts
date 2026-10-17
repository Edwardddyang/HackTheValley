// Run: npm test (node --test src/lib/ai/)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type * as AdCheckCore from "./ad-check-core";
import type { Brief } from "../brief";
import type { Extras } from "../extras";
import type * as SummaryCore from "./summary-core";

// Node runs .ts natively, but the modules are loaded by URL and keep their types through the type-only imports
// above (see the note in this file's history: value imports by URL, types from the declaration).
const {
  MAX_BEDROOMS, RENT_LIMITS, buildEvidence, checkLine, citesFor, extractNumbers, groundingContext, isNumberGrounded,
  parseSummaryRequest, rentControl, summaryCacheKey, summaryResponseSchema, summarySystemInstruction, summaryUserPrompt,
  templateLines, templateSummary, TEMPLATE_MODEL, toSummary, validateSummaryOutput,
} = (await import(new URL("./summary-core.ts", import.meta.url).href)) as typeof SummaryCore;
const { adCheckContext, rentComparison } =
  (await import(new URL("./ad-check-core.ts", import.meta.url).href)) as typeof AdCheckCore;

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
  flags: lines.sentences.map((l) => ({ text: l.text, evidence_ids: l.ids })),
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
  // The server-computed inversion keeps "lower than 99.1% of buildings" phrasings grounded.
  assert.equal(building.percent_of_toronto_buildings_scoring_equal_or_higher, 99.1);
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

test("checkLine grounds spelled-out numbers like digits", () => {
  const set = buildEvidence(brief(), extras());
  const ctx = groundingContext(set);
  const { address, sr311_ward: ward, latest } = set.refs;
  const ok = (text: string, ids: (string | null)[]) => checkLine(text, ids as string[], ctx, 350);

  // "fifteen" happens to be grounded (the Nov 15, 2018 rent-control note); "forty" is in nothing cited.
  assert.match(ok("The landlord raised rent by fifteen percent and there were forty complaints.", [address]) ?? "",
    /number word "forty" is not in the cited evidence/);
  assert.match(ok("Thirty-two units were inspected.", [latest]) ?? "", /number word "thirty"/);
  assert.match(ok("A DOZEN tenants complained.", [address]) ?? "", /number word "dozen"/);
  // Grounded number words pass, and "one" and "no" are ordinary words, not quantities.
  assert.equal(ok("Ward eleven had 23,632 requests.", [ward]), null);
  assert.equal(ok("Balcony guards were graded one of three, the lowest grade.", [latest]), null);
  assert.equal(ok("No one item scored below 1.", [latest]), null);

  // A cited item that spells the number out itself grounds it ("sixty-unit" in a permit description).
  const b = brief();
  for (const p of b.construction_nearby.notable) p.description = "Proposed sixty-unit rental building";
  const spelled = buildEvidence(b, extras());
  const line = "The nearest major permit is for a sixty-unit rental building.";
  assert.equal(checkLine(line, [spelled.refs.nearest_notable!.id], groundingContext(spelled), 350), null);
  assert.match(checkLine(line, [set.refs.nearest_notable!.id], ctx, 350) ?? "", /number word "sixty"/);
});

test("checkLine keeps 311, crime and census off the building without a preposition or with a possessive", () => {
  const set = buildEvidence(brief(), extras());
  const ctx = groundingContext(set);
  const { sr311_nearby: nearby, crime, registration } = set.refs;
  const renters = set.refs.census.renter_households;
  const ok = (text: string, ids: (string | null)[]) => checkLine(text, ids as string[], ctx, 350);

  // 311: "has" pins area requests on the building as surely as "at" does; negated attribution still passes.
  assert.match(ok("This building has 328 311 requests.", [nearby]) ?? "", /311 requests to the building/);
  assert.equal(ok("311 requests within 500 m describe the area, not this building.", [nearby]), null);
  assert.equal(ok("311 logged 328 requests within 500 m rather than at the address.", [nearby]), null);

  // Crime: the possessive no longer slips through.
  assert.match(ok("This building's assault rate was 1,080.9 per 100,000 people in 2025.", [crime]) ?? "",
    /crime to the building/);
  // Census: the same rule, with or without a possessive.
  assert.match(ok("The building's households: 59.1% rent.", [renters]) ?? "", /census data to the building/);
  assert.match(ok("In this building, 59.1% of households rent.", [renters]) ?? "", /census data to the building/);
  assert.equal(ok("In the Annex, 59.1% of households rent.", [renters]), null);

  assert.equal(ok("The building's City registration lists hot water heating.", [registration]), null);

  // Conditions keep the possessive exemption: a nearby permit's fire repairs may be placed near "the building's"
  // entrance, but not "at the building".
  const b = brief();
  for (const p of b.construction_nearby.notable) p.description = "Fire damage repair";
  const fireSet = buildEvidence(b, extras());
  const fireCtx = groundingContext(fireSet);
  const permit = fireSet.refs.nearest_notable!.id;
  assert.equal(checkLine("Fire repairs are under way near the building's entrance.", [permit], fireCtx, 350), null);
  assert.match(checkLine("Fire repairs are under way at the building.", [permit], fireCtx, 350) ?? "",
    /attributes fire to the building without a building record/);
});

test("the rent flag needs a clear gap over the vacant-unit average", () => {
  const set = buildEvidence(brief(), extras());
  const flagged = (rent: number, beds: number) => {
    const cx = rentComparison(EXTRAS.rent_benchmark, rent, beds);
    const lines = templateLines(brief(), extras(), set, cx);
    assert.deepEqual(validateSummaryOutput(asModelOutput(lines), adCheckContext(set, rent, beds, cx)).rejected, []);
    return lines.sentences.some((s) => /^Asks /.test(s.text));
  };
  assert.equal(flagged(2097, 1), false, "$5 (0%) over the $2,092 vacant 1-bedroom average");
  assert.equal(flagged(2180, 1), false, "$88 (4%) over");
  assert.equal(flagged(2200, 1), true, "$108 (5%) over");
  assert.equal(flagged(2350, 1), true, "$258 (12%) over");
  assert.equal(flagged(2000, 1), false, "below the average");
  // A 3-bedroom only has the all-units average (long-time tenants included): never a flag.
  assert.equal(rentComparison(EXTRAS.rent_benchmark, 3500, 3)?.kind, "all_units");
  assert.equal(flagged(3500, 3), false, "$305 over the all-units average");

  // The prompt states the same threshold, and the LISTING section carries the computed gap.
  assert.match(summarySystemInstruction(500), /an asking rent well above the CMHC vacant-unit average \(about 5% or more\)/);
  const prompt = summaryUserPrompt(set.evidence, rentComparison(EXTRAS.rent_benchmark, 2350, 1));
  assert.ok(prompt.includes('"asks_minus_average":258') && prompt.includes('"percent_difference":12'));
  assert.ok(!summaryUserPrompt(set.evidence).includes("LISTING"));
});

test("checkLine: rent control must be hedged in statements, and no advice on signing", () => {
  const set = buildEvidence(brief(), extras());
  const ctx = groundingContext(set);
  const { latest, address } = set.refs;
  const ok = (text: string, ids: (string | null)[]) => checkLine(text, ids as string[], ctx, 350);

  assert.equal(ok("Built in 1960, the building is likely covered by Ontario's rent-increase guideline; confirm with the landlord.", [latest]), null);
  assert.match(ok("The unit is rent controlled.", [latest]) ?? "", /states rent control as certain/);
  assert.match(ok("Built in 1960, so the rent-increase guideline applies.", [latest]) ?? "", /states rent control as certain/);
  // Questions may ask about it.
  assert.equal(ok("Is this unit covered by rent control?", [latest]), null);

  for (const text of ["You should not sign this lease.", "Don't sign before a viewing.", "Don’t sign yet.",
    "You shouldn't sign without the registration.", "Do not sign until the balcony is fixed.", "Walk away from this one."]) {
    assert.equal(ok(text, [address]), "gives advice on signing", text);
  }
});

test("template flags on 375 Brunswick: worry-first, cited, grounded, at most 3", () => {
  const summary = templateSummary(brief(), extras(), new Date("2026-10-17T12:00:00Z"));
  assert.equal(summary.model, TEMPLATE_MODEL);
  assert.equal(summary.generated_at, "2026-10-17T12:00:00.000Z");
  assert.equal(summary.sentences.length, 3);
  assert.ok(summary.checklist.length >= 3 && summary.checklist.length <= 6, `checklist: ${summary.checklist.length}`);
  for (const line of [...summary.sentences, ...summary.checklist]) {
    assert.ok(line.cites.length > 0, line.text);
    for (const c of line.cites) assert.ok(c.dataset && c.file, line.text);
  }
  const texts = summary.sentences.map((s) => s.text);
  // Worst first: the bottom-0.9% inspection score, then the big change close by, then no AC on file.
  assert.equal(texts[0],
    "Scored 70/100 on its latest RentSafeTO evaluation (Oct 2, 2025), down from 81 in Oct 2023; only 0.9% of evaluated Toronto buildings score lower.");
  assert.match(texts[1], /m away at /);
  assert.equal(texts[2], "No air conditioning and no cooling room on the building's City registration.");
  assert.ok(summary.checklist.some((q) => /balcony guards 1 of 3/.test(q.text)));

  // The template passes the same checks as Gemini's answer, with nothing dropped.
  const set = buildEvidence(brief(), extras());
  const checked = validateSummaryOutput(asModelOutput(templateLines(brief(), extras(), set)), groundingContext(set));
  assert.deepEqual(checked.rejected, []);
  assert.equal(checked.sentences.length, summary.sentences.length);
  assert.equal(checked.checklist.length, summary.checklist.length);
});

test("with a listing, the rent flag outranks the registration and stays grounded", () => {
  const set = buildEvidence(brief(), extras());
  const cx = rentComparison(EXTRAS.rent_benchmark, 2350, 1);
  assert.ok(cx && cx.diff === 258 && cx.pct === 12);
  const lines = templateLines(brief(), extras(), set, cx);
  assert.equal(lines.sentences.length, 3);
  const texts = lines.sentences.map((s) => s.text);
  assert.match(texts[0], /^Scored 70\/100/);
  assert.match(texts[1], /m away at /);
  assert.match(texts[2], /^Asks \$2,350 a month — \$258 \(12%\) above CMHC's vacant-unit average for 1-bedroom rentals/);
  assert.deepEqual(lines.sentences[2].ids, [set.refs.rent]);

  // The renter's own numbers ($2,350, $258, 12%) pass only with the listing-extended context.
  const ctx = adCheckContext(set, 2350, 1, cx);
  const checked = validateSummaryOutput(asModelOutput(lines), ctx);
  assert.deepEqual(checked.rejected, []);
  const plain = validateSummaryOutput(asModelOutput(lines), groundingContext(set));
  assert.ok(plain.rejected.some((r) => /2350|258/.test(r.reason)), JSON.stringify(plain.rejected));
});

test("template flags without extras, without RentSafeTO, and for a newer building", () => {
  const check = (b: Brief, x: Extras | null) => {
    const set = buildEvidence(b, x);
    const lines = templateLines(b, x, set);
    assert.deepEqual(validateSummaryOutput(asModelOutput(lines), groundingContext(set)).rejected, []);
    for (const l of [...lines.sentences, ...lines.checklist]) assert.ok(l.ids.length > 0, l.text);
    assert.ok(lines.sentences.length <= 3);
    return lines.sentences.map((s) => s.text);
  };

  const noExtras = check(brief(), null);
  assert.ok(noExtras.length >= 2);
  assert.ok(!noExtras.some((t) => /CMHC|registration/.test(t)));

  // A house: no RentSafeTO record means no score flag, but nearby change still flags.
  const house = brief();
  house.building = { in_rentsafe: false, note: "No RentSafeTO evaluation with this exact address." };
  const houseLines = check(house, { registration: null, rent_benchmark: EXTRAS.rent_benchmark });
  assert.ok(houseLines.length >= 1);
  assert.ok(!houseLines.some((t) => /Scored \d+\/100/.test(t)));
  assert.ok(houseLines.some((t) => /m away/.test(t)));

  // A post-2018 building flags its likely rent-control exemption.
  const newer = brief();
  if (newer.building.in_rentsafe) newer.building.year_built = 2021;
  assert.ok(check(newer, extras()).some((t) => /Likely exempt/.test(t) && /built in 2021/.test(t)));
  assert.equal(rentControl(2018), "unknown");
  assert.equal(rentControl(null), "unknown");

  // Nothing standing out means zero flags - the honest empty state - while the checklist still helps.
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
  assert.equal(empty.sentences.length, 0);
  assert.ok(empty.checklist.length >= 1);
});

test("response schema limits citations to the evidence ids and allows zero flags", () => {
  const set = buildEvidence(brief(), extras());
  const ids = set.evidence.items.map((i) => i.id);
  const schema = summaryResponseSchema(ids);
  assert.deepEqual(schema.properties.flags.items.properties.evidence_ids.items.enum, ids);
  assert.equal(schema.properties.flags.minItems, 0);
  assert.equal(schema.properties.flags.maxItems, 3);
  assert.deepEqual(schema.required, ["flags", "checklist"]);
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
    ok: true, value: { address_point_id: 778448, radius_m: 500, rent: null, beds: null },
  });
  assert.deepEqual(parseSummaryRequest({ address_point_id: 7, radius_m: 250, rent: 2350, beds: 1 }, limits), {
    ok: true, value: { address_point_id: 7, radius_m: 250, rent: 2350, beds: 1 },
  });
  for (const bad of [null, [], {}, { address_point_id: "778448" }, { address_point_id: -1 }, { address_point_id: 1.5 },
    { address_point_id: 7, radius_m: 50 }, { address_point_id: 7, radius_m: 2000 }, { address_point_id: 7, radius_m: "500" },
    { address_point_id: 7, rent: 5 }, { address_point_id: 7, rent: "2350" }, { address_point_id: 7, beds: 1.5 },
    { address_point_id: 7, beds: 11 }]) {
    assert.equal(parseSummaryRequest(bad, limits).ok, false, JSON.stringify(bad));
  }
  // The shared bounds, exactly: the page reading rent and beds from the URL uses the same ones.
  assert.deepEqual(RENT_LIMITS, { min: 100, max: 50_000 });
  assert.equal(MAX_BEDROOMS, 10);
  const at = (extra: Record<string, unknown>) => parseSummaryRequest({ address_point_id: 7, ...extra }, limits).ok;
  for (const ok of [{ rent: RENT_LIMITS.min }, { rent: RENT_LIMITS.max }, { beds: 0 }, { beds: MAX_BEDROOMS }]) {
    assert.equal(at(ok), true, JSON.stringify(ok));
  }
  for (const bad of [{ rent: RENT_LIMITS.min - 1 }, { rent: RENT_LIMITS.max + 1 }, { beds: -1 }, { beds: MAX_BEDROOMS + 1 }]) {
    assert.equal(at(bad), false, JSON.stringify(bad));
  }
  const tooHigh = parseSummaryRequest({ address_point_id: 7, rent: 75_000 }, limits);
  assert.ok(!tooHigh.ok && tooHigh.error === "rent must be a monthly amount in dollars from 100 to 50,000, or left out.");
  assert.equal(summaryCacheKey({ address_point_id: 778448, radius_m: 500, rent: null, beds: null }), "778448:500:-:-");
  assert.equal(summaryCacheKey({ address_point_id: 778448, radius_m: 500, rent: 2350, beds: 1 }), "778448:500:2350:1");
});
