# Design

## Context

See proposal.md for motivation; the requirements are in the delta specs. This design assumes the code as it will be after PR #11 and PR #13 are merged:

- `src/core/store.ts` keeps one global list per document (`globalThis`, `Symbol.for('orpc-inspector:store')`): newest first, at most 300. It replaces a record object whenever the record changes, and calls its listeners synchronously.
- `src/client/page-script.ts` (`startPageScript()`, guarded by a global so a second load returns the same channel) hydrates SSR records, then publishes the store to the panel as `{ calls, order }`. Only records whose object changed are copied, and updates are throttled to one per 50 ms (#11).
- Records hold `attempts` (with per-attempt headers and `eventsBefore`), `events` (last 100) and `eventCount`. An aborted call is `cancelled` with no error (#13).
- Client records on the dev server keep header values; the panel masks them on display. SSR records and client records in opted-in production builds have sensitive headers replaced with `***` at record time (`toHeaderRecord`, `maskDataHeaders`), and the panel offers no reveal for them.
- Panel settings live in the panel iframe's localStorage. The page script can't read them synchronously at load, before the panel exists.

Evidence from the maintainer's experiments with a throwaway prototype in Chromium (not in the repo; E4 for saving and restoring, E5 for schema extension):

| Saved content | Characters | Write (stringify + setItem) |
|---|---|---|
| 300 typical records | 0.29 M | ~2 ms |
| 300 × 10 KB responses | 3.25 M | ~27 ms |
| 295 typical + 5 × 1 MB | 5.38 M | `QuotaExceededError`, previous value kept |

- Restore by id produced no duplicates on reload or on a second reload.
- Neither a return from the back/forward cache nor HMR added listeners or restored twice, when the restore ran only at load.
- Adding optional fields to records needs no migration, and SSR escaping and masking are unaffected (E5).

## Goals / Non-Goals

**Goals:**

- Calls made before a reload or document navigation in the same tab can be selected and copied into a report after it.
- The saved copy never silently goes stale, never resurrects cleared records, and never breaks the app (exceptions, storage quota, main-thread time).
- Saved-format changes are detectable (`v`), and future optional record fields need no format change.

**Non-Goals:**

- Cross-tab sync, long-term history, cross-origin collection, server-side recording.
- Masking bodies in the saved copy.
- The page a call was made on (#2), the client name (#5), navigation dividers.
- Separating apps that share an origin.

## Decisions

### Owner: the page script, not the panel

The page script saves and restores. The panel only shows the toggle and status, and calls an action to change the setting. The page script runs whether or not the panel is open, is the only side that sees every store change, and owns clear. A panel-side copy would miss calls made while the dock is closed and could disagree with the store about what was cleared (issue #3, alternatives).

A new module, `src/client/preserve-log.ts`, is started by `startPageScript()` after SSR hydration. It has its own global guard, so HMR or a second load never adds a second subscription or `pagehide` listener.

### Storage keys and envelope

Two sessionStorage keys on the app's origin:

- `orpc-inspector:preserve-log:enabled`: `"1"` while the toggle is on; absent otherwise.
- `orpc-inspector:preserve-log:records`: the envelope.

```ts
interface PreservedLog {
  v: 1
  /** Store order, newest first; masked copies, large ones as summaries */
  list: OrpcCall[]
  /** Records left out by the budget or a failed write, including ones carried over from earlier pages */
  dropped: number
  /** Time of the last clear, for pages returning from the back/forward cache */
  clearedAt?: number
}
```

- On read, anything that isn't an object with `v === 1` and an array `list` is discarded and the key removed. A reader never tries to upgrade or partially read another version.
- `v` changes only for incompatible changes (a field renamed or removed, a meaning changed).
- Adding optional record fields keeps `v`: the saved list is the store's records as they are, with only the masking and summary rules below applied, and no whitelist of fields. Whatever #2 or #5 add later is saved and restored with no change here.

The toggle has its own key because a failed write may need to remove the records key, and that must not turn the toggle off.

### Toggle: toolbar, off by default, remembered per tab

- A "Preserve log" checkbox in the toolbar next to Clear, where the Network tab has it. It isn't in Settings: it changes what happens on the next navigation, so it must be visible while reproducing a bug.
- Off by default (issue #3). Turning it on saves the current store immediately, so calls made just before turning it on are kept too.
- The choice is remembered in sessionStorage, not the panel's localStorage:
  - The page script must know it synchronously at load, before any panel connects, and the panel iframe's storage may not be the page's.
  - Per tab means it survives exactly the reloads and navigations it exists for. A forgotten toggle doesn't keep writing request data into every new tab.
- The panel learns the state from a new shared state, `preserveLog`, and changes it through a new action, `preserveLog:set`.
- Turning it off removes both keys at once. Records already in the list stay until cleared or the page is reloaded.

### Saving: changed records only, at most once a second, flushed on `pagehide`

- A store listener schedules a save at most once per second (trailing). A long stream that changes the store many times a second costs at most one write a second.
- `pagehide` (any `persisted` value) and `visibilitychange` to `hidden` flush synchronously. Either may be the last chance before the document is discarded; `beforeunload` is not used because it is unreliable and blocks BFCache in some browsers.
- Each record's saved form (masked, maybe summarized, then `JSON.stringify`) is cached by record object in a `WeakMap`, like the publisher in #11. Unchanged records cost a string concatenation.
- The write happens in the page script's own scheduling and never inside the store's synchronous listener path, so a slow write never delays a call's result.
- Every storage access is wrapped. An exception never reaches the app.

### Size: 64 KB per record, 2,000,000 characters in total

- **Per record.** A record whose JSON is over 65,536 characters is saved as a summary: every field except `input`, `output`, `events` and `error.data`, plus `notPreserved: { fields, size }` naming the fields that held data and the record's full size in characters. `eventCount` and `attempts[].eventsBefore` stay, so the panel can still say how many events there were.
- **Total.** The list is filled newest first. When the next record doesn't fit in full it is tried as a summary, and when the summary doesn't fit either, it and every older record are left out and added to `dropped`. 2,000,000 characters is about 40 % of Chromium's ~5 M character per-origin quota, which leaves the rest to the app. At E4's rate (3.25 M characters in ~27 ms) a full copy writes in about 16 ms.
- **Quota.** If `setItem` still throws (the app's own data filled the origin), the writer retries once with every record as a summary. If that fails too, it removes the records key and writes a small envelope `{ v: 1, list: [], dropped: <count> }`, then reports the failure. E4 showed a failed `setItem` leaves the previous value in place, so without the removal a reload would quietly show an older list.
- **Benchmark gate (the stop-loss condition set during planning).** Before the panel work, measure one save (fit, mask, stringify, `setItem`) in Chromium with a store holding about 5 MB of records: 300 × ~16 KB, and 295 typical + 5 × 1 MB. If any single save takes over 30 ms, the default becomes summaries for every record. That changes this design and the specs, so it goes back to the maintainer before implementation continues.

`dropped` is cumulative across pages: a restored envelope's `dropped` is carried into the new page and added to what its own saves leave out, so "Partially preserved" stays visible after a reload until the user clears. Records pushed out by the store's 300-record limit are not counted; that limit applies with or without Preserve log.

### Masking: headers as for SSR records, bodies as they are

The saved form replaces, with `***`, values of headers whose names match the default sensitive pattern. This covers top-level request and response headers, each attempt's headers, and headers inside error data. These are the rules SSR records and opted-in production records follow at record time (`isSensitiveKey`, `maskDataHeaders`).

- The default pattern is used because the template's pattern lives in the panel and isn't available at load.
- Restored values that are `***` have no reveal control, as for SSR records.
- Bodies (`input`, `output`, `events`, error data other than headers) are saved unmasked. This keeps today's rule (bodies are masked only in copied reports, with the template's pattern) and was decided by the maintainer.
- The guide states the consequence plainly. Tokens or personal data in bodies, such as a login response's `accessToken`, sit in the tab's sessionStorage until the toggle is turned off, the log is cleared or the tab is closed. Any script on the origin, and anyone with DevTools on that machine, can read them.

### Restore: once per document load

At start, after SSR hydration:

1. Read the toggle. If it's off, stop; nothing is restored.
2. Read and validate the envelope (discard on mismatch).
3. Drop records whose id is already in the store. Ids are `<time>-<random>`, so a clash means the same record, and the current document's version wins.
4. Mark the rest `fromPreviousPage: true`. Set `pending` and `streaming` records to `unknown` and remove their `duration`; keep their events and attempts.
5. Append them after the store's current records (the new page's client calls, then its SSR records) in one store update, cutting the total at 300. A new store method appends older records and emits once, so the publisher patches all restored ids in one update.
6. Carry `dropped` over, then save at once so the envelope reflects the new document.

Only one load restores. `pageshow` with `persisted === true` (a return from the back/forward cache) restores nothing, because the page's memory still holds its store. Restoring again would duplicate records or bring back cleared ones, and E4 confirmed the store is intact. It does re-read two things:

- The toggle: if it was turned off on a later page, this page stops saving.
- `clearedAt`: if the log was cleared after this page was hidden, this page's store is cleared too, because every record in it predates that clear.

### Order and de-duplication with SSR

Records restored from earlier documents are older than anything the new document made, so they go last. Within them the saved order is kept. The `Merge on the client` order for SSR records is unchanged: the store reads client calls of this page, then SSR records of this page, then previous pages' records. SSR records saved on an earlier page come back with side `ssr` and the previous-page mark.

### `unknown` state

A call unfinished when its page was left has no knowable result: a `POST` that triggered the navigation most likely succeeded on the server. The existing states don't fit:

- `error` would count it in the Errors filter, the dock badge and the error report.
- `cancelled` now means the app stopped it (#13).
- Leaving it `pending` would show it as running forever.

So `OrpcCallState` gains `unknown`:

- It has its own row indicator, with the accessible name "Outcome unknown" / "結果未知".
- It is not counted as an error anywhere.
- The details say the page was left before the call finished.
- In reports it reads `❔ Outcome unknown (page left before the call finished)`.

Only restore sets it; the recorder never does.

### Marking records from a previous page

- `OrpcCall.fromPreviousPage?: true` is set at restore and kept through later saves, so a record two navigations back is still marked.
- The row shows a tag: "Previous page" / "前一頁".
- The details show "From a previous page" / "來自前一個頁面".
- Copied reports are in English. The request line's marker reads `(client · from a previous page)`, next to the existing `client` / `SSR` and `not sent` markers, under the Request section toggle. The errors report shows the same marker.
- The errors report's duplicate grouping key includes the mark, so an error from the previous page and the same error on this page are listed separately rather than merged under one of them.
- `notPreserved` fields read `(not preserved: 120 KB, over the 64 KB limit)` in the details and in reports, in place of the body, events or error data.

### Status in the toolbar

The `preserveLog` shared state is `{ enabled, available, dropped, summarized, failed }`:

- `available` is false when sessionStorage throws on access (for example a sandboxed iframe or a storage-blocking privacy setting). The checkbox is then disabled, with a tooltip saying why.
- When `dropped` or `summarized` is above 0, a "Partially preserved" / "部分未保存" note appears next to the checkbox. Its tooltip gives both counts.
- When the last write failed, the note reads "Not preserved: storage is full" / "未保存：儲存空間已滿".
- Clear resets the counts.

The state is published like `calls`, separately from it, so record patches stay as #11 made them.

## Risks / Trade-offs

- [Request data in sessionStorage] → Off by default, remembered per tab only, headers masked. The rest is documented, and turning it off or clearing deletes the copy at once.
- [The app's own sessionStorage use plus the 2 M budget can exceed the quota] → The app's writes come first in practice (ours are deferred), our writes fail safely, and the toolbar says so. The budget may need lowering if users report it.
- [A page restored from the back/forward cache saves its own store and replaces records made on the page the user came back from] → Restoring on `pageshow` was ruled out. Its records are the page's own, and a return is the user's own navigation. Documented in the guide.
- [Two apps on one origin in the same tab restore each other's records] → Rare in dev. Documented. A per-app key needs an app id the page script doesn't have today.
- [`unknown` is a new member of an exported union] → Additive; code with an exhaustive switch over `OrpcCallState` gains a case. Called out in the release notes.
- [Up to one second of changes can be lost if the tab crashes] → A navigation or reload flushes on `pagehide`. A crash is not the case this feature serves.
- [Saving costs main-thread time on large stores] → Changed-records-only serialization, at most one write a second, the 2 M budget and the 30 ms benchmark gate.

## Open Questions

- #2 and #5 together with this change, or later: see proposal.md. Recommended: later, relying on the no-whitelist save rule.
- If the benchmark gate fails, whether summaries-for-all should be the default or a second toggle ("Preserve bodies") is needed. Decide only if the gate fails.

## Review record

External sources: the maintainer's task brief in the planning conversation (no linked document); issue #3; the maintainer's planning notes (experiments E4 and E5, dependency graph, pre-mortem; not in the repo). All were read.

Level: high risk. Additive irreversible items touch security: request data, including unmasked bodies, is written to the tab's sessionStorage. The exported `OrpcCallState` gains `unknown`, and `OrpcCall` gains two optional fields. Reversible: the panel layout, wording, limits and storage format (a saved copy lives only in one tab and is discarded on a version change).

Decision points are numbered as on the review page.

| Item | Where | Source or agent | Handling |
|---|---|---|---|
| Bug reports as the main use; restored records reach reports | proposal: Why | source | follows the source |
| Browser side only, dock panel, no server recording; no cross-tab, history or cross-origin | proposal: Out of scope | source (issue #3, brief) | follows the source |
| Page script owns saving and restoring, not the panel | design: Owner | source (issue #3 alternatives) | implementation |
| Versioned envelope, discarded on mismatch | design: Storage keys and envelope | source | follows the source |
| Two keys (toggle, records); `v` bumped only for incompatible changes | design: Storage keys and envelope | agent | implementation |
| Saved copy keeps every record field, no whitelist | design: Storage keys and envelope | agent | decision point 6 |
| Toggle in the toolbar, off by default, remembered per tab | design: Toggle | agent (the source asked for a decision; off by default from issue #3) | decision point 1 |
| Turning on saves current records; turning off deletes the copy | design: Toggle | source (issue #3) and agent | decision point 1 |
| Save at most once a second, flush on `pagehide` and `visibilitychange` | design: Saving | source (continuous saving plus a flush on leaving, issue #3); interval agent | implementation |
| Per-record cache of the saved form | design: Saving | agent | implementation |
| 64 KB per-record summary and which fields it keeps | design: Size | source (limit); agent (fields) | implementation |
| 2,000,000-character total budget, newest first, dropped count | design: Size | agent | decision point 2 |
| Quota fallback: summaries only, then remove the stale copy | design: Size | agent (no silent staleness from the pre-mortem) | decision point 2 |
| 30 ms benchmark gate | design: Size | source | follows the source |
| What to do if the gate fails | design: Open Questions | agent | decision point 11 |
| Headers masked like SSR records; bodies unmasked | design: Masking | source | follows the source |
| Default sensitive pattern, not the template's | design: Masking | agent | decision point 5 |
| Restore once at load; none on `pageshow` | design: Restore | source | follows the source |
| Re-read the toggle and `clearedAt` on `pageshow` | design: Restore | agent | decision point 7 |
| Restored records after the new page's SSR records, de-duplicated by id | design: Order | agent (the source asked for a decision) | decision point 4 |
| New `unknown` state for unfinished calls | design: `unknown` state | agent ("outcome unknown" from the source) | decision point 3 |
| Previous-page tag and notes, report marker wording, errors report grouping | design: Marking | source (marker); agent (wording, grouping) | decision point 8 |
| Toolbar status: "Partially preserved", "Not preserved", unavailable | design: Status | source ("Partially preserved"); agent (others) | decision point 2 |
| Risk: request data in sessionStorage | design: Risks | source (pre-mortem) | documented in the guide |
| Risk: app and budget together exceed the quota | design: Risks | agent | decision point 2 |
| Risk: a page back from the back/forward cache overwrites later records | design: Risks | agent | decision point 7 |
| Risk: two apps on one origin share the copy | design: Risks | agent | decision point 12 |
| Risk: `unknown` added to an exported union | design: Risks | agent | decision point 3 |
| Risk: up to a second lost on a crash | design: Risks | agent | implementation |
| Risk: main-thread cost on large stores | design: Risks | source (gate) | implementation |
| Opted-in production builds get Preserve log too (not stated in the specs) | specs: none | agent (gap) | decision point 9 |
| #2 / #5 together or later | proposal: Open question | source (asked to be listed) | decision point 10 |
