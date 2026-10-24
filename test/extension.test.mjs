import { test } from "node:test";
import assert from "node:assert/strict";

import register from "../src/index.ts";

function createHarness() {
  const handlers = new Map();
  const commands = new Map();
  const statuses = [];
  const notifications = [];

  const pi = {
    on(event, handler) {
      handlers.set(event, handler);
    },
    registerCommand(name, options) {
      commands.set(name, options);
    },
  };

  const ctx = {
    mode: "tui",
    hasUI: true,
    ui: {
      theme: {
        fg: (_color, text) => text,
      },
      setStatus: (key, text) => {
        statuses.push([key, text]);
      },
      notify: (message, type) => {
        notifications.push([message, type]);
      },
    },
  };

  register(pi);
  return { handlers, commands, statuses, notifications, ctx };
}

test("registers the tps command and measures a complete response", async () => {
  const harness = createHarness();
  const { handlers, commands, statuses, notifications, ctx } = harness;

  assert.ok(commands.has("tps"));
  assert.ok(handlers.has("message_update"));
  assert.ok(handlers.has("message_end"));

  await handlers.get("session_start")({}, ctx);
  const now = Date.now();
  const message = {
    role: "assistant",
    timestamp: now - 500,
    usage: { output: 100 },
    stopReason: "stop",
    durationMs: 2_000,
    model: "model",
    provider: "provider",
  };

  await handlers.get("message_start")({ message }, ctx);
  await handlers.get("message_update")(
    {
      message,
      assistantMessageEvent: {
        type: "text_delta",
        delta: "hello world again",
      },
    },
    ctx,
  );

  assert.ok(
    statuses.some(
      ([key, text]) =>
        key === "tps" && typeof text === "string" && text.includes("t/s"),
    ),
  );

  await new Promise((resolve) => setTimeout(resolve, 5));
  await handlers.get("message_end")({ message }, ctx);

  await commands.get("tps").handler("", ctx);
  assert.ok(
    notifications.some(([message]) => message.includes("Decode TPS")),
  );

  await commands.get("tps").handler("reset", ctx);
  assert.ok(
    notifications.some(([message]) => message.includes("statistics reset")),
  );

  await handlers.get("session_shutdown")({}, ctx);
  assert.ok(statuses.some(([key, text]) => key === "tps" && text === undefined));
});
