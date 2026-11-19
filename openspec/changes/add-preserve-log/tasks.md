# Tasks

## 1. Before implementation

- [ ] 1.1 Wait until PR #11 and PR #13 are merged, then rebase this branch on `main`; verify that the published state is still `{ calls, order }`, that `cancelled`, `attempts[].eventsBefore` and the events view are in place, and update design.md where the merged code differs
- [ ] 1.2 Get the maintainer's decision on the open question (#2 / #5 together or later) and record it in proposal.md; verify the scope sections of proposal.md and design.md match the decision
- [ ] 1.3 Benchmark gate: in Chromium, time one save (fit to limits, mask, stringify, `setItem`) for a store of about 5 MB of records (300 × ~16 KB; 295 typical + 5 × 1 MB); record the numbers in design.md. If any save takes over 30 ms, stop: make summaries the default for every record in design.md and the specs, and get the maintainer's confirmation before continuing

## 2. Types and store

- [ ] 2.1 Add `unknown` to `OrpcCallState`, optional `fromPreviousPage` and `notPreserved` to `OrpcCall`, and the `preserveLog` shared state and `preserveLog:set` action to `OrpcInspectorProtocol` in `src/core/types.ts`; verify with `pnpm typecheck` and that `unknown` is not counted by the dock badge (`test/dom` badge test)
- [ ] 2.2 Add a store method that appends older records after the current ones in one update, cut at 300; verify with a store test (one emit, order, limit, existing ids skipped)

## 3. Saving (page side)

- [ ] 3.1 Add `src/client/preserve-log.ts` with the two sessionStorage keys, the `v: 1` envelope, the saved form (header masking with the default pattern, 64 KB summaries with `notPreserved`, cached per record object) and the 2,000,000-character fill; verify with `test/dom/preserve-log.test.ts`: masked top-level, per-attempt and error-data headers; bodies unchanged; a 1 MB output saved as a summary that keeps `eventCount`; newest first under the budget with the left-out count; unknown record fields kept
- [ ] 3.2 Schedule saves at most once a second and flush on `pagehide` and `visibilitychange` to `hidden`; wrap every storage access; verify with fake timers (a burst of 500 changes in two seconds writes at most three times) and with a `sessionStorage` that throws on every call (calls and the store unaffected, status unavailable)
- [ ] 3.3 On a refused write, retry with summaries only, then remove the records key and write the small failure envelope; verify with a test whose second `setItem` throws `QuotaExceededError` that the earlier copy is not restored on the next start and the status reports the failure
- [ ] 3.4 Start the module from `startPageScript()` after SSR hydration, guarded per document; verify that starting twice and an HMR-style re-import add no second listener and do not restore twice

## 4. Restore, clear and the toggle

- [ ] 4.1 Restore once at start: validate the envelope (discard other versions and bad JSON), skip known ids, mark `fromPreviousPage`, turn `pending` / `streaming` into `unknown` without duration while keeping events and attempts, append after SSR records, carry `dropped`, then save; verify with tests for the spec scenarios (reload with SSR records, same id, two navigations, limit, older format, corrupted value, reload during a pending call and during a stream)
- [ ] 4.2 Make `calls:clear` delete the saved records, cancel a pending save, write `clearedAt` and reset counts; make `preserveLog:set` save at once when turned on and delete both keys when turned off; verify clear-then-reload, clear-then-navigate, turning off and turning on with records already in the store
- [ ] 4.3 On `pageshow` with `persisted` true, re-read the setting and `clearedAt` without restoring; verify with a test that fires `pagehide` and `pageshow` (`persisted: true`) around a clear and a toggle change made through storage, and in Chromium with the Back button that the store has no duplicates

## 5. Panel

- [ ] 5.1 Add the toolbar checkbox (disabled when unavailable) and the status note ("Partially preserved" with both counts in the tooltip, "Not preserved: storage is full"), in English and Traditional Chinese, and keep the narrow toolbar within 360 px; verify with `test/dom/panel-app.test.ts`, `test/panel/i18n.test.ts` and the narrow layout test
- [ ] 5.2 Add the `unknown` state indicator, the "Previous page" row tag, the "From a previous page" and "outcome unknown" notes in details, and the not-preserved placeholders for input, output, events and error data; verify with `test/dom/panel-app.test.ts` (distinct indicator and accessible names, tag only on restored rows, no reveal for `***`, placeholders with size)
- [ ] 5.3 In `panel/report.ts`, add the previous-page marker to the request line, the `unknown` title and the not-preserved placeholders; leave `unknown` records out of the errors report and add the mark to its duplicate key; verify with `test/panel/report.test.ts` for each spec scenario and that reports of records without the new fields are unchanged

## 6. Docs and checks

- [ ] 6.1 Add `docs/guide/preserve-log.md` and `docs/guide/preserve-log.zh-TW.md`. Cover: how to turn it on, what is restored and how it is marked, the `unknown` state, the size limits and the status note, the back/forward cache behavior, apps sharing an origin, and a security section on what is saved to sessionStorage (masked headers, unmasked bodies, who can read it, how to delete it, the default pattern). Link the guide from the README feature list and guide links in both languages; verify both languages say the same thing
- [ ] 6.2 Run `pnpm check`. Then check in Chromium with the panel open, against a real oRPC 1.16 server: a 401 that redirects to a sign-in page, a reload during a slow call, a stream cut by a navigation, Back from the back/forward cache, an HMR update, clear then reload, and 5 × 1 MB responses (status note). Run `pnpm smoke --pm pnpm --app vite` and `--app nuxt`; verify the store, the saved copy and the panel match the specs
