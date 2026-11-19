# Proposal

## Why

The recorder already keeps every transport attempt and the events of a streamed response, but the panel never shows them. A call retried as 503, 503, 200 looks like a plain 200, and a stream that failed after two events shows the error next to an empty body. A few records are also wrong: aborting a call through its `AbortSignal` (for example a query library cancelling a query) is recorded as a red `error` that lands in the Errors filter and in copied error reports, `Map` and `Set` values are recorded as `{}`, and when a stream reconnects after an error its events from every attempt run together with nothing marking where an attempt starts.

The main use of the inspector is pasting a failing call into a bug report for teammates, so what the panel shows and what the report says have to match what actually happened.

## What Changes

- The call details show the transport attempts (method, status or "no response", URL) when a call made more than one.
- The call details show the events of a streamed response in order, with their position in the stream, the total count, and a note when older events were dropped (the recorder keeps the last 100). For a stream, the body is no longer shown as empty when it never has a body; error data is still shown when the stream failed.
- When a stream reconnects, the recorder notes on the new attempt how many events had arrived before it, and the panel marks that boundary in the event list.
- A call whose `AbortSignal` is aborted is recorded as `cancelled` with no error, for plain calls and for streams (events received before the abort are kept). It no longer counts as an error in the filter, the dock badge or the error report.
- `Map` values are recorded as an array of `[key, value]` entries and `Set` values as an array of their values, the same shapes oRPC's own serializer sends. Today both become `{}`.
- Copied reports:
  - The request fields add an `Attempts` line, e.g. `3 (503 → 503 → 200)`, when a call made more than one attempt. It follows the existing Request section toggle.
  - The response section of a streamed call includes its events (with the same trimming and masking as other JSON), grouped by attempt when the stream reconnected. It follows the existing Response toggle, so report templates gain no new setting.

Decision on `Map` / `Set`: the `Records are serializable` requirement lists exactly which values are converted and how, and says nothing about `Map` or `Set`. Choosing a recorded shape for them changes what that requirement says, so under the contributing rules it is part of this change rather than a standalone bug fix.

Out of scope (follow-ups):

- Labeling batched or deduplicated calls: the panel shows one URL per call (`/rpc/ping`) while the network shows one batch request (`/rpc/ping/__batch__`).
- The placeholder `http://orpc/<path>` URL shown for WebSocket and MessagePort links.
- Recording calls made inside a Web Worker.
- Request and response headers per attempt in the panel (the top-level headers stay those of the last attempt, as today).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `call-recording`: aborted calls are recorded as `cancelled`; `Map` and `Set` get a recorded shape; reconnect attempts of a stream record where they start in the event list.
- `inspector-panel`: the call details show transport attempts and stream events; copied reports include attempts and stream events.

## Impact

- Code: `src/core/recorder.ts` (abort detection, reconnect boundary), `src/core/classify-error.ts` (`toPlain` for `Map` / `Set`), `src/core/types.ts` (new optional field on `OrpcCallAttempt`), `panel/panel-app.vue` plus small new panel helpers, `panel/report.ts`, `panel/i18n.ts`.
- Types: one new optional field on the exported `OrpcCallAttempt` type; no breaking change. Records from earlier versions (SSR payloads, saved templates) stay valid.
- Docs: `docs/guide/` in English and Traditional Chinese (what the details and reports show, cancelled calls).
- Expected small overlap with the parallel oRPC v2 work in `src/core/recorder.ts` and `src/core/classify-error.ts`; the edits here stay local to the stream wrapper, `record()` error path, `recordTransport` and `toPlain`.
