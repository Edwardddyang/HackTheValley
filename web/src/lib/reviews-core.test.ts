import assert from "node:assert/strict";
import { test } from "node:test";

import type * as Core from "./reviews-core";

const { parseNewReview } = (await import(new URL("./reviews-core.ts", import.meta.url).href)) as typeof Core;

const ok = { address_point_id: 778448, rating: 4, body: "Quiet building, super fixes things within a day.", author: " Sam " };

test("a valid review is cleaned and accepted", () => {
  const r = parseNewReview(ok);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.value, { address_point_id: 778448, rating: 4, body: ok.body, author: "Sam" });
});

test("control characters become spaces and an empty name becomes null", () => {
  const r = parseNewReview({ ...ok, body: "Line one\u0000\nline two, long enough to post.", author: "   " });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.body, "Line one line two, long enough to post.");
    assert.equal(r.value.author, null);
  }
});

test("bad ratings, short or long bodies, long names and bad ids are refused", () => {
  for (const bad of [
    { ...ok, rating: 0 }, { ...ok, rating: 6 }, { ...ok, rating: 3.5 },
    { ...ok, body: "too short" }, { ...ok, body: "x".repeat(1001) },
    { ...ok, author: "n".repeat(41) }, { ...ok, address_point_id: -1 }, { ...ok, address_point_id: "abc" },
  ]) assert.equal(parseNewReview(bad).ok, false, JSON.stringify(bad).slice(0, 60));
});

test("the honeypot field marks spam", () => {
  const r = parseNewReview({ ...ok, website: "http://spam.example" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.spam, true);
});
