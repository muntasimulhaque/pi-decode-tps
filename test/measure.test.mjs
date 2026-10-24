import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SlidingWindow,
  estimateTokens,
  formatTps,
} from "../src/measure.ts";

test("estimateTokens counts words, punctuation and CJK", () => {
  assert.equal(estimateTokens("hello world"), 2);
  assert.equal(estimateTokens("const x = 1;"), 5);
  assert.equal(estimateTokens("hello, world!"), 4);
  assert.equal(estimateTokens("你好世界"), 4);
  assert.equal(estimateTokens(""), 0);
});

test("formatTps uses whole numbers at 10+ and one decimal below", () => {
  assert.equal(formatTps(0), "0");
  assert.equal(formatTps(-1), "0");
  assert.equal(formatTps(9.94), "9.9");
  assert.equal(formatTps(9.96), "10.0");
  assert.equal(formatTps(46.4), "46");
});

test("sliding window returns 0 when empty", () => {
  const window = new SlidingWindow(1_000);
  assert.equal(window.tps(0), 0);
  assert.equal(window.tps(10_000), 0);
});

test("sliding window sums events and uses the actual span", () => {
  const window = new SlidingWindow(1_000);
  window.record(10, 0);
  assert.equal(window.tps(1_000), 10);

  window.record(10, 1_000);
  assert.equal(window.tps(1_000), 20);

  assert.equal(window.tps(2_001), 0);
});

test("sliding window extends a same-timestamp burst to the previous event", () => {
  const window = new SlidingWindow(1_000);
  window.record(10, 900);
  window.record(100, 2_000);

  const tps = window.tps(2_000);
  assert.ok(tps > 50, `expected a real rate, got ${tps}`);
  assert.ok(tps < 200, `expected burst protection, got ${tps}`);
});

test("sliding window enforces the minimum span", () => {
  const window = new SlidingWindow(1_000);
  window.record(10, 2_000);
  assert.equal(window.tps(2_000), 100);
});
