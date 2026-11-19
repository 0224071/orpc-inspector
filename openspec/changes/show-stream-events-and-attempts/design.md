# Design

## Context

See proposal.md for motivation; the requirements are in the delta specs.

- `record()` in `src/core/recorder.ts` wraps the outermost link interceptor. Its options carry the call's `signal`. Errors go through `classifyError`; a returned event iterator is wrapped, and the wrapper reports `success`, `error` or `cancelled` (consumer `return()`).
- `recordTransport()` wraps the outermost client interceptor and pushes one `OrpcCallAttempt` per transport attempt onto the record found in the context. `ClientRetryPlugin` sits inside both, so a stream reconnect shows up as a new transport attempt while the outer iterator keeps yielding.
- `toPlain()` in `src/core/classify-error.ts` copies values through `JSON.stringify` with a replacer (bigint, Blob). `Map` and `Set` have no own enumerable properties, so they become `{}`.
- Records already hold `attempts`, `events` (last 100) and `eventCount`; nothing under `panel/` reads them.
- Report templates are saved in the browser; their `sections` keys are fixed, and older saved templates must keep working.

## Goals / Non-Goals

**Goals:**

- Abort detection that works for any abort reason, including a query library's cancel.
- A reconnect marker that keeps `events` a plain list of values.
- Event and attempt rendering logic that the panel and the report share, as plain functions with unit tests.

**Non-Goals:**

- Per-attempt headers in the panel.
- New report template settings.
- Changing how many events are kept.

## Decisions

### Abort: check the signal, not the error

When `record()` catches an error, or the stream wrapper sees the iterator throw, the call is `cancelled` if `signal?.aborted` is true at that moment. Otherwise it goes through `classifyError` as today.

Alternative: match `error.name === 'AbortError'`. `controller.abort(reason)` rejects with the reason itself, which can be any value, and an `AbortError` can come from an unrelated inner signal (a timeout inside a custom fetch). The signal the caller passed is what "the caller cancelled" means.

A cancelled record keeps no `error`. The panel draws `error` in the red error box and the report treats it as a failure; a cancel is neither.

### Reconnect marker: `eventsBefore` on the attempt

`OrpcCallAttempt` gains an optional `eventsBefore: number`. `recordTransport()` sets it to the call's `eventCount` when the call already has `events`, which only happens after the first attempt returned an iterator.

Alternatives:
- An attempt number per event (parallel array or wrapping each event): doubles bookkeeping for every event, or changes the shape of `events`, which existing records and the copied JSON rely on.
- A marker value inserted into `events`: would be counted, copied and shown as data.

The marker uses absolute positions, so it stays right after older events are dropped: event `i` of `events` is at position `eventCount - events.length + i`.

### `Map` and `Set` in `toPlain`

The replacer returns `Array.from(value)` for both: entries for `Map`, values for `Set`. `JSON.stringify` then walks the returned array, so nested values still go through the replacer. This matches the shape oRPC's RPC serializer puts on the wire. An object keyed by the map's keys would read better for string keys but loses non-string keys and looks like a plain object.

### Shared stream view

A new `panel/stream-view.ts` turns a record into the event list to show: each event with its 1-based position, divider entries for attempts whose `eventsBefore` falls inside the kept range, the total and whether events were dropped. A second helper groups events by attempt for the report. `panel-app.vue` renders the first; `report.ts` uses the second. A divider whose `eventsBefore` points into the dropped events is not shown.

### Panel layout

- Attempts: a compact list in the Request part, shown only for more than one attempt.
- Events: an Events part in the Response part, shown for records with `eventCount` defined. The Body part is shown for such records only when there is a body value; when it is hidden, the Events part carries the Response copy toggle (`output`). When both are shown, the toggle stays on Body and covers both.

### Report

- `Attempts` is one more field under the Request section: `3 (503 → 503 → 200)`, `no response` for a failed transport.
- Events are a JSON block after the response block, under the Response (`output`) section: a list, or an object keyed `attempt 1`, `attempt 2`, … when the stream reconnected. The label carries the count, e.g. `Events (150, last 100)`. They go through `maskSensitive` and `trimJson` like the response. When the report is over its length limit, dropping the Response section drops the events too, so `fitLength` needs no change.

## Risks / Trade-offs

- [A call that fails for another reason just as its signal aborts is recorded as `cancelled`] → The caller had cancelled it, so its result no longer matters to the app either.
- [The parallel oRPC v2 work edits `recorder.ts` and `classify-error.ts`] → Keep edits to the catch path, the stream wrapper's end handler, `recordTransport` and the `toPlain` replacer; no moves or renames.
- [Long streams make the details long] → At most 100 events are kept, and the JSON tree's existing depth rule keeps nested objects inside each event collapsed.
- [Older records have no `eventsBefore`] → They show no dividers, which is what they show today.
