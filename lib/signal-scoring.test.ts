import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's strip-types runner resolves the explicit TypeScript extension.
import { calculateSignalScore } from "./signal-scoring.ts";

test("a real public signal produces a non-zero score", () => {
  assert.equal(calculateSignalScore(1, 0, 0, 0), 5);
});

test("signal score is capped at one hundred", () => {
  assert.equal(calculateSignalScore(100, 100, 100, 1000), 100);
});
