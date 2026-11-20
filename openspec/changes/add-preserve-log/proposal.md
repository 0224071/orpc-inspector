# Proposal

## Why

Records live in the page's memory, so a full reload or a document navigation empties the panel. The calls that matter most in a bug report often happen right before such a navigation: a login that redirects, a form that submits and moves to another page, a 401 that sends the user to the sign-in page. Today the Network tab with "Preserve log" still shows `POST /rpc/unauthorized 401` after the redirect, while the inspector shows nothing, so the call can't go into the copied report the team relies on (issue #3).

## What Changes

- A **Preserve log** toggle in the panel toolbar, off by default, like the Network tab's. The choice is remembered for the tab (sessionStorage), so it survives the reloads it exists for, and a new tab starts with it off.
- While it is on, the page script keeps a saved copy of the store in the tab's sessionStorage: within a second of each change, and once more when the page is hidden (`pagehide`).
- The saved copy is wrapped in a versioned envelope (`{ v: 1, ... }`). A copy with another version, or one that can't be parsed, is discarded.
- Size limits:
  - A record whose JSON is over 64 KB is saved as a summary: everything except its input, output, stream events and error data, with a note of what was left out and how big the record was.
  - The whole copy stays within 1,000,000 characters, well under the ~5 M character sessionStorage quota, so the app keeps room for its own data. Older records that don't fit are left out and counted.
  - When the browser still refuses the write, the old copy is removed rather than left behind silently stale.
  - The toolbar shows "Partially preserved" ("部分未保存") whenever records or bodies were left out, and "Not preserved" when the write failed.
- On a full page load (not on a return from the back/forward cache), the page script restores the saved records once:
  - after the new page's own records and SSR records, de-duplicated by id, within the 300-record limit;
  - marked as coming from a previous page (a row tag, a note in the details, and a marker in copied reports);
  - calls that were `pending` or `streaming` when the page was left get a new state, `unknown` ("Outcome unknown" / "結果未知"); events received before leaving are kept.
- Clear empties the saved copy too, so cleared records never come back after a reload. A page restored from the back/forward cache drops its records when the log was cleared on a later page.
- Turning the toggle off deletes the saved copy; the next load restores nothing.
- Builds that include the inspector through the `production` option get the same toggle, also off by default.
- The saved copy masks the same headers as SSR records (request, response and per-attempt headers whose names match the default sensitive pattern, and headers inside error data). Bodies are saved as they are, as they are in memory today. The docs gain a Preserve log guide in English and Traditional Chinese, including what ends up in sessionStorage and who can read it.

Out of scope:

- Syncing between tabs, long-term history (localStorage, IndexedDB), collecting across origins, and recording on the server.
- Masking bodies. Body masking stays as today: only copied reports mask body keys, with the template's pattern.
- The page a call was made on (#2) and the client name (#5). See the open question below.
- "Navigated to …" dividers in the list. They need the page each call was made on (#2).
- Restoring on a return from the back/forward cache.
- Keeping two apps on the same origin apart. They share one saved copy per tab.

## Open question: source fields #2 and #5

#2 (the page a call was made on) and #5 (the client name) both add fields captured when a call starts. Preserve log saves whole records, so the question is whether those fields are defined together with this change or later.

| | Define together | Add later |
|---|---|---|
| Saved format | Set once, with the fields in it | `v` stays 1: a prototype showed optional fields need no migration, and the saved copy keeps every record field (decision in design.md), so new fields are saved as soon as they exist |
| Restored records | Show where they were made from the first release | Records saved by the older version (only within the same tab session) lack the fields and look like legacy records |
| Report marker | One wording, e.g. `from a previous page: /orders?tab=open` | Changes once more: `from a previous page`, later followed by the page |
| List dividers ("Navigated to …") | Possible in this change | Come with #2 |
| Scope and review | Larger change: #5 needs a way to name clients, which has nothing to do with navigation | Two focused changes |
| Risk | This change waits on the design of #5 | Low. The save rule above is the only forward-compatibility guarantee needed |

Recommendation: add them later, as their own change. The forward-compatible save rule removes the format cost, and the remaining cost is one report wording change. #2 and #5 are not in this change's scope.

Decision: confirmed by the maintainer in review. #2 and #5 come later as their own change.

## Capabilities

### New Capabilities

- `preserve-log`: the saved copy of browser records across page loads in one tab, including its toggle, format, limits, masking, restore, clear and failure behavior.

### Modified Capabilities

- `inspector-panel`: the Preserve log toggle and status in the toolbar (including the narrow layout), the `unknown` state indicator, the previous-page tag and notes in details, and the previous-page marker in copied reports.
- `panel-hosting`: the in-page channel gains the Preserve log setting and its save status next to the record list and the clear action.

## Impact

- Depends on PR #11 (published state as `{ calls, order }`, throttled publishing) and PR #13 (`cancelled` on abort, `attempts`, `eventsBefore`, events in details and reports). Implementation starts after both are merged, on top of their store and schema.
- Code:
  - `src/client/` gains a preserve module started by `startPageScript()`.
  - `src/core/store.ts` gains a way to append older records in one update.
  - `src/core/types.ts` gains the `unknown` state, two optional record fields, and a new shared state and action in `OrpcInspectorProtocol`.
  - `panel/panel-app.vue`, `panel/report.ts` and `panel/i18n.ts` show and report them.
- Types: `OrpcCallState` gains `'unknown'`, and `OrpcCall` gains optional `fromPreviousPage` and `notPreserved` fields. Code that switches over every state of the exported type gets a new case. Existing records stay valid.
- Storage: two sessionStorage keys on the app's origin, written only while the toggle is on.
- Docs: a new `docs/guide/preserve-log.md` and its Traditional Chinese version, plus the README feature list and guide links in both languages.
