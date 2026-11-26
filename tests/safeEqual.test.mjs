import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEqual } from "../api/_lib/safeEqual.ts";

test("safeEqual returns true for identical strings", () => {
  assert.equal(safeEqual("abc123", "abc123"), true);
});

test("safeEqual returns false for different strings", () => {
  assert.equal(safeEqual("abc123", "abc124"), false);
});

test("safeEqual returns false for different-length strings without throwing", () => {
  assert.equal(safeEqual("short", "a much longer secret"), false);
});
