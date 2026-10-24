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

function assistantMessage(now) {
  return {
    role: "assistant",
    timestamp: now - 500,
    usage: { output: 100 },
    stopReason: "stop",
    durationMs: 2_000,
    model: "model",
    provider: "provider",
  };
}

test("footer stays stable while streaming and updates once at message_end", async () => {
  const { handlers, commands, statuses, notifications, ctx } = createHarness();

  await handlers.get("session_start")({}, ctx);
  const now = Date.now();
  const message = assistantMessage(now);

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

  assert.equal(
    statuses.filter(
      ([key, text]) =>
        key === "tps" && typeof text === "string" && text.includes("t/s"),
    ).length,
    0,
    "footer must not update while streaming",
  );

  await new Promise((resolve) => setTimeout(resolve, 5));
  await handlers.get("message_end")({ message }, ctx);

  assert.ok(
    statuses.some(
      ([key, text]) =>
        key === "tps" && typeof text === "string" && text.includes("t/s"),
    ),
    "footer should update after message_end",
  );

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

test("/tps shows live progress on demand while streaming", async () => {
  const { handlers, commands, notifications, ctx } = createHarness();

  await handlers.get("session_start")({}, ctx);
  const now = Date.now();
  const message = assistantMessage(now);

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

  await commands.get("tps").handler("", ctx);
  assert.ok(
    notifications.some(
      ([message]) =>
        message.includes("live") &&
        message.includes("estimated, 1s window"),
    ),
  );

  await handlers.get("message_end")({ message }, ctx);
  await handlers.get("session_shutdown")({}, ctx);
});
