# Tasks

## 1. Recording

- [x] 1.1 Record a call as `cancelled` with no error when it fails after its signal was aborted, in `record()` and in the stream wrapper's error path; verify with `test/orpc-v1/scenarios.test.ts` cases for a plain call aborted in flight and a stream aborted after two events (state, no error, events kept, caller still gets the abort error), and that a stream failing without an abort stays `error` with its events
- [x] 1.2 Add optional `eventsBefore` to `OrpcCallAttempt` and set it in `recordTransport()` when the call already has events; verify with a scenarios test of a stream reconnected twice by `ClientRetryPlugin` (attempts mark 2 and 4) and that a retried plain call has no `eventsBefore`
- [x] 1.3 Record `Map` as entries and `Set` as values in `toPlain`; verify with `test/core/classify-error.test.ts` (nested Map inside a Set, bigint inside a Map) and that the test fails when the replacer branch is removed

## 2. Panel details

- [x] 2.1 Add `panel/stream-view.ts` (event positions, reconnect dividers, dropped-event note, grouping by attempt); verify with `test/panel/stream-view.test.ts` covering a full stream, 150 events with 100 kept, a reconnect inside and outside the kept range, and records without `eventsBefore`
- [x] 2.2 Show the attempts list (more than one attempt only, "no response" for a failed transport) in the details; verify with `test/dom/panel-app.test.ts`
- [x] 2.3 Show the Events part for streamed records, hide an empty Body for them, move the Response copy toggle to Events when Body is hidden, and add English and Traditional Chinese strings; verify with `test/dom/panel-app.test.ts` (failed stream with two events, 150 events, no events, reconnect divider) and `test/panel/i18n.test.ts`

## 3. Copied reports

- [x] 3.1 Add the `Attempts` field under the Request section and the events block under the Response section in `panel/report.ts`; verify with `test/panel/report.test.ts` (retried call line, masked stream events, grouped by attempt after a reconnect, no events with Response off, single-attempt call unchanged)

## 4. Docs and checks

- [x] 4.1 Update `docs/guide/` in English and Traditional Chinese: what the details show for retried and streamed calls, cancelled calls, and that reports include attempts and events; verify both language files say the same thing
- [x] 4.2 Run `pnpm check` and check the harness scenarios (`stream.midError`, `stream.abortSignal`, `tanstack.cancelQuery`, `retry.2failsThenOk`, `stream.retryAfterMidError`, `fetch.specialTypes`) in a real browser with the panel open; verify the records and the panel match the specs
