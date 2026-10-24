import { test } from "node:test";
import assert from "node:assert/strict";

import { TpsTracker, totalsTps } from "../src/engine.ts";

function feed(
  tracker,
  {
    requestAt = 0,
    firstAt = 1_000,
    endAt = 3_000,
    output = 100,
    stopReason = "stop",
    durationMs = 3_200,
  } = {},
) {
  tracker.beginMessage(requestAt);
  tracker.recordDelta("hello world", firstAt);
  return tracker.finishMessage({
    outputTokens: output,
    stopReason,
    durationMs,
    now: endAt,
    model: "model",
    provider: "provider",
  });
}

test("finishMessage computes decode TPS, TTFT and end-to-end TPS", () => {
  const tracker = new TpsTracker();
  const sample = feed(tracker);

  assert.ok(sample);
  assert.equal(sample.outputTokens, 100);
  assert.equal(sample.decodeMs, 2_000);
  assert.equal(sample.ttftMs, 1_000);
  assert.equal(sample.tps, 50);
  assert.equal(sample.endToEndTps, 31.25);
  assert.equal(sample.estimatedTokens, 2);
  assert.equal(tracker.last, sample);
  assert.equal(tracker.shown, sample);
  assert.equal(totalsTps(tracker.task), 50);
  assert.equal(totalsTps(tracker.session), 50);
  assert.equal(tracker.task.responses, 1);
  assert.equal(tracker.session.responses, 1);
});

test("short samples update totals but do not replace a meaningful shown value", () => {
  const tracker = new TpsTracker();
  const meaningful = feed(tracker);
  const short = feed(tracker, {
    requestAt: 4_000,
    firstAt: 5_000,
    endAt: 5_100,
    output: 5,
    durationMs: 1_000,
  });

  assert.equal(tracker.last, short);
  assert.equal(tracker.shown, meaningful);
  assert.equal(tracker.task.responses, 2);
  assert.equal(tracker.session.responses, 2);
});

test("a first short sample is still shown", () => {
  const tracker = new TpsTracker();
  const short = feed(tracker, {
    requestAt: 0,
    firstAt: 1_000,
    endAt: 1_100,
    output: 5,
    durationMs: 1_500,
  });

  assert.equal(tracker.last, short);
  assert.equal(tracker.shown, short);
});

test("resetTask keeps session data and the shown value", () => {
  const tracker = new TpsTracker();
  const sample = feed(tracker);
  assert.equal(tracker.shown, sample);

  tracker.resetTask();
  assert.equal(tracker.task.responses, 0);
  assert.equal(tracker.session.responses, 1);
  assert.equal(tracker.last, sample);
  assert.equal(tracker.shown, sample);

  feed(tracker);
  assert.equal(tracker.task.responses, 1);
  assert.equal(tracker.session.responses, 2);
});

test("invalid responses are skipped", () => {
  const tracker = new TpsTracker();

  tracker.beginMessage(0);
  tracker.recordDelta("x", 1_000);
  assert.equal(
    tracker.finishMessage({ outputTokens: 10, stopReason: "error", now: 2_000 }),
    null,
  );

  tracker.beginMessage(0);
  assert.equal(
    tracker.finishMessage({ outputTokens: 10, stopReason: "stop", now: 2_000 }),
    null,
  );

  tracker.beginMessage(0);
  tracker.recordDelta("x", 1_000);
  assert.equal(
    tracker.finishMessage({ outputTokens: 0, stopReason: "stop", now: 2_000 }),
    null,
  );

  tracker.beginMessage(0);
  tracker.recordDelta("x", 1_000);
  assert.equal(
    tracker.finishMessage({ outputTokens: 10, stopReason: "stop", now: 1_000 }),
    null,
  );

  assert.equal(tracker.last, null);
  assert.equal(tracker.shown, null);
  assert.equal(tracker.task.responses, 0);
  assert.equal(tracker.session.responses, 0);
});

test("live TPS uses the sliding window while streaming", () => {
  const tracker = new TpsTracker();
  tracker.beginMessage(0);

  tracker.recordDelta("a b c d e f g h i j", 1_000);
  assert.equal(tracker.isStreaming, true);
  assert.equal(tracker.estimatedStreamTokens, 10);
  assert.equal(tracker.liveTps(1_100), 100);

  tracker.recordDelta("a b c d e f g h i j", 1_500);
  assert.equal(tracker.liveTps(1_500), 40);

  assert.equal(tracker.liveTps(2_000), 20);
  assert.equal(tracker.liveTps(2_501), 0);
});

test("resetAll clears last, shown, task and session", () => {
  const tracker = new TpsTracker();
  feed(tracker);
  tracker.resetAll();

  assert.equal(tracker.last, null);
  assert.equal(tracker.shown, null);
  assert.equal(tracker.task.responses, 0);
  assert.equal(tracker.session.responses, 0);
  assert.equal(tracker.isStreaming, false);
});
