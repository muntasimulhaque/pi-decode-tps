# pi-decode-tps

Decode throughput for Pi's footer: **live while the model streams, exact when it finishes.**

```text
~\Documents\GitHub\quran (main)
↑358k ↓104k R42M CH99.6% $0.244 30.9%/1.0M      (opencode-go) deepseek-v4.1-flash • max
⚡ 46 t/s
```

The status line is added with `ctx.ui.setStatus()`. It does not replace or modify Pi's built-in footer.

## What it measures

**Decode TPS** = output tokens ÷ time from the first streamed token to the end of the assistant message.

It deliberately excludes:

- prompt prefill and time to first token (TTFT)
- provider queueing and network time before the first token
- tool execution time (`message_end` fires before tools run)

This is the convention used by llama.cpp/Ollama/vLLM generation throughput and by Artificial Analysis's "Output Speed". It is **not** the same as Hermes's built-in rolling last-10 number, which includes prefill and whole-request time.

| | Window | Includes TTFT? | Live? |
|---|---|---|---|
| **pi-decode-tps** | first delta → `message_end` | no | yes (estimated) |
| Hermes built-in | last 10 API calls | yes | no |
| Hermes token-speed plugin | 1s sliding window | no | yes |
| DSH / pi-dsh-tps | first delta → `message_end` | no | no |

## Live vs exact

- **While streaming:** a 1-second sliding window over `text_delta`, `thinking_delta`, and `toolcall_delta` chunks. Tokens are estimated cheaply (word/punctuation/CJK characters), so the live number is approximate. It updates 4×/sec and is colored with the theme accent.
- **When the response ends:** the number is recomputed exactly from the provider's `usage.output` and the measured decode window, then shown dim.
- Responses with no first token, no usage, zero output, or `pending`/`error`/`aborted`/`deferred` stop reasons are skipped.
- A short response does not overwrite a meaningful footer value. The first sample is shown even if short; after that, samples under 20 output tokens or 300 ms decode are ignored for the footer (but still counted in `/tps`).

`usage.output` already includes reasoning tokens, so hidden thinking is included automatically.

## Install

```bash
pi install npm:pi-decode-tps
```

Try it for one run without installing:

```bash
pi -e npm:pi-decode-tps
```

Or install from GitHub:

```bash
pi install git:github.com/muntasimulhaque/pi-decode-tps
```

Restart Pi, or run `/reload`, after installing.

## Usage

- The footer shows `⚡ 46 t/s` after the first completed response. It stays hidden until then.
- While streaming, the number is live and provisional. When the response ends, it settles to the exact decode value.
- Run `/tps` for a breakdown: last response, TTFT, end-to-end throughput, live estimate drift, task average, session average, and model/provider.
- Run `/tps reset` to clear the collected statistics and the footer value.

Session and task statistics are in memory. They reset when Pi restarts, when the extension reloads, or when you switch sessions. (Persistence can be added later with custom session entries if wanted.)

The extension uses the status key `tps`. Do not run it alongside another extension that writes the same key (for example pi-pulse).

## Accuracy notes

- The live number is a regex estimate. Expect roughly ±20% drift on mixed text/code; the exact post-response value does not use the estimate.
- Exact TPS uses the provider-reported `usage.output`. If a provider omits usage for a response, that response is skipped rather than guessed.
- Decode time is measured client-side at Pi's event boundaries, so it can differ slightly from a server-side eval timer.
- TTFT is measured from `AssistantMessage.timestamp` (request start) to the first non-empty delta; it includes queueing, prefill, and network time.
- End-to-end TPS in `/tps` is `usage.output ÷ AssistantMessage.durationMs`, which is useful for comparing against Hermes-style numbers.

## Development

```bash
npm install
npm test
npm run typecheck
```

The extension is plain TypeScript with no runtime dependencies. Pi loads `src/index.ts` directly through jiti.

## License

MIT
