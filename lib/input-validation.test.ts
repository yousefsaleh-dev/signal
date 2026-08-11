import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's strip-types runner resolves the explicit TypeScript extension.
import { normalizeHttpUrl } from "./input-validation.ts";

test("normalizes a bare website hostname", () => {
  assert.equal(normalizeHttpUrl("example.com"), "https://example.com/");
});

test("rejects unsafe website protocols", () => {
  assert.equal(normalizeHttpUrl("javascript:alert(1)"), null);
  assert.equal(normalizeHttpUrl(""), "");
});
