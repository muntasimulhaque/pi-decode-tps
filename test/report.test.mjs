import { test } from "node:test";
import assert from "node:assert/strict";

import { formatReport } from "../src/report.ts";

const sample = {
  outputTokens: 100,
  decodeMs: 2_000,
  ttftMs: 500,
  tps: 50,
  endToEndTps: 40,
  estimatedTokens: 90,
  model: "deepseek-v4.1-flash",
  provider: "opencode-go",
  timestamp: 1,
};

const task = { outputTokens: 300, decodeMs: 6_000, responses: 3 };
const session = { outputTokens: 1_200, decodeMs: 24_000, responses: 12 };

test("report includes last, task, session and details", () => {
  const text = formatReport({
    last: sample,
    shown: sample,
    task,
    session,
    liveTps: 0,
    streaming: false,
    estimatedStreamTokens: 0,
  });

  assert.match(text, /last\s+50 t\/s/);
  assert.match(text, /TTFT 500ms/);
  assert.match(text, /end-to-end 40 t\/s/);
  assert.match(text, /live estimate 90 tok \(-10%\)/);
  assert.match(text, /task\s+50 t\/s/);
  assert.match(text, /session\s+50 t\/s/);
  assert.match(text, /opencode-go \/ deepseek-v4\.1-flash/);
});

test("report explains a short sample and the previous shown value", () => {
  const short = { ...sample, outputTokens: 5, decodeMs: 100, tps: 50 };
  const text = formatReport({
    last: short,
    shown: sample,
    task,
    session,
    liveTps: 0,
    streaming: false,
    estimatedStreamTokens: 0,
  });

  assert.match(text, /previous meaningful sample/);
  assert.match(text, /shown\s+50 t\/s/);
});

test("report handles a first short sample", () => {
  const short = { ...sample, outputTokens: 5, decodeMs: 100, tps: 50 };
  const text = formatReport({
    last: short,
    shown: short,
    task: { outputTokens: 5, decodeMs: 100, responses: 1 },
    session: { outputTokens: 5, decodeMs: 100, responses: 1 },
    liveTps: 0,
    streaming: false,
    estimatedStreamTokens: 0,
  });

  assert.match(text, /short sample/);
});

test("report handles no samples", () => {
  const text = formatReport({
    last: null,
    shown: null,
    task: { outputTokens: 0, decodeMs: 0, responses: 0 },
    session: { outputTokens: 0, decodeMs: 0, responses: 0 },
    liveTps: 0,
    streaming: false,
    estimatedStreamTokens: 0,
  });

  assert.match(text, /No completed response yet/);
});

test("report shows live progress while streaming", () => {
  const text = formatReport({
    last: sample,
    shown: sample,
    task,
    session,
    liveTps: 57.3,
    streaming: true,
    estimatedStreamTokens: 210,
  });

  assert.match(text, /live\s+57 t\/s\s+estimated, 1s window/);
});
