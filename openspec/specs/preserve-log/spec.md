# preserve-log Specification

## Purpose

Keep the browser records across reloads and document navigations in one tab while the user opts in, so calls made right before a page change can still be inspected and copied into a bug report.

## Requirements

### Requirement: Preserve log setting
The system SHALL provide a Preserve log setting that is off by default. The page script SHALL keep the setting in the tab's sessionStorage, so it survives reloads and navigations within the tab and a new tab starts with it off. Turning it on SHALL save the current records at once. Turning it off SHALL delete the saved copy at once; records already in the store stay until cleared or the page is reloaded.

#### Scenario: First use
- **WHEN** the app is opened in a new tab
- **THEN** Preserve log is off, nothing is written to sessionStorage, and a reload shows only the new page's records

#### Scenario: Setting survives a reload
- **WHEN** the user turns Preserve log on and reloads the page
- **THEN** Preserve log is still on

#### Scenario: Calls made before turning it on
- **WHEN** the store has 3 records, the user turns Preserve log on and reloads the page
- **THEN** the 3 records are restored

#### Scenario: Turning it off
- **WHEN** Preserve log is on with 5 saved records, the user turns it off and reloads the page
- **THEN** no record is restored and nothing of the saved copy is left in sessionStorage

#### Scenario: Opted-in production build
- **WHEN** an app built with `orpcInspector({ production: true })` is opened in a new tab
- **THEN** Preserve log is off, and once it is turned on, records are saved and restored as on the dev server

### Requirement: Save the store while Preserve log is on
While Preserve log is on, the page script SHALL save a copy of the store to sessionStorage within one second after the store changes, at most once per second, and SHALL save once more synchronously when the page is hidden (`pagehide` or `visibilitychange` to `hidden`). Saving SHALL NOT throw into the app, delay a call's result or change what calls return or throw.

#### Scenario: Navigation right after a call
- **WHEN** Preserve log is on, a call to `auth.login` finishes and the app immediately navigates to another document in the same tab
- **THEN** the `auth.login` record is restored on the new document

#### Scenario: Long stream
- **WHEN** Preserve log is on and a stream delivers 500 events within two seconds
- **THEN** the saved copy is written at most three times during the stream

#### Scenario: Storage throws
- **WHEN** Preserve log is on and every sessionStorage write throws
- **THEN** calls return the same results as with Preserve log off, and no error reaches the app

### Requirement: Versioned saved format
The saved copy SHALL be an envelope with a version number `v`, the saved records in store order, and the number of records left out. When the saved value cannot be parsed, is not an object, or has a `v` other than the one the running version writes, the system SHALL discard it without restoring anything from it. The saved records SHALL keep every record field, except where masking and size limits require otherwise, so fields added to records later are saved without a format change.

#### Scenario: Older format
- **WHEN** Preserve log is on and sessionStorage holds a saved copy with `v: 0`
- **THEN** a reload restores no records from it and the copy is replaced by a valid one

#### Scenario: Corrupted value
- **WHEN** Preserve log is on and the saved copy is not valid JSON
- **THEN** a reload restores nothing, the panel works normally, and no error reaches the app

#### Scenario: A record field unknown to this version
- **WHEN** a saved record has an extra field `page: "/orders"`
- **THEN** the restored record still has `page: "/orders"`

### Requirement: Mask headers in the saved copy
The saved copy SHALL replace with `***` the values of headers whose names match the default sensitive pattern: request and response headers, each transport attempt's headers, and headers inside error data, the same as SSR records. Input, output, stream events and the rest of error data SHALL be saved as they are in the store.

#### Scenario: Authorization header
- **WHEN** Preserve log is on and a dev server call sends `authorization: Bearer abc`
- **THEN** the saved copy holds `***` for `authorization` and does not contain `Bearer abc`, while the record in memory keeps its value

#### Scenario: Retried call
- **WHEN** a call with two attempts sent `authorization` on both
- **THEN** both attempts' `authorization` values are `***` in the saved copy

#### Scenario: Token in the body
- **WHEN** a call's output is `{ accessToken: "xyz" }`
- **THEN** the saved copy holds `accessToken: "xyz"` unchanged

### Requirement: Size limits of the saved copy
A record whose JSON is over 65,536 characters SHALL be saved as a summary: every field except input, output, stream events and error data, with a note naming the left-out fields that held data and the record's size. The whole saved copy SHALL stay within 1,000,000 characters: records are added newest first, a record that doesn't fit is tried as a summary, and when its summary doesn't fit either, it and all older records are left out and counted.

#### Scenario: One large response
- **WHEN** Preserve log is on and a call returns a 1 MB output
- **THEN** the saved copy holds that record's procedure, state, status, headers and timing, no output, and a note that output was not preserved with the record's size

#### Scenario: Stream over the limit
- **WHEN** a stream record with 100 kept events and an event count of 400 is over the per-record limit
- **THEN** the saved summary has no events and keeps the event count 400

#### Scenario: Over the total
- **WHEN** the store's records, saved as summaries where needed, would take 1,200,000 characters
- **THEN** the saved copy is at most 1,000,000 characters, the newest records are the ones saved, and the number of left-out records is recorded

### Requirement: No stale copy after a failed write
When the browser refuses a write, the system SHALL retry once with every record as a summary. When that also fails, it SHALL remove the previous saved records, so that a reload never shows an older copy as if it were current, and SHALL report the failure to the panel with the number of records not saved.

#### Scenario: Quota exceeded
- **WHEN** Preserve log is on, a save succeeds, and the next save fails because sessionStorage is full
- **THEN** a reload does not restore the records of the earlier successful save, and the panel reports that the records were not preserved

### Requirement: Restore on page load
When a document loads with Preserve log on, the page script SHALL restore the saved records once, after merging SSR records: records whose id is already in the store are skipped, the rest are appended after the store's records in their saved order, the store's limit of 300 still applies (dropping the oldest), and every restored record is marked as coming from a previous page. The mark SHALL stay on the record when it is saved and restored again.

#### Scenario: Reload with SSR records
- **WHEN** Preserve log is on with saved records `b`, `a` (newest first), and the reloaded page carries SSR records `s1`, `s2` and makes client call `c` after hydration
- **THEN** the store is, in order, `c`, `s2`, `s1`, `b`, `a`, and only `b` and `a` are marked as from a previous page

#### Scenario: Same id
- **WHEN** a saved record has the same id as a record already in the store at load
- **THEN** the store has only one record with that id, the one that was already there

#### Scenario: Two navigations
- **WHEN** Preserve log is on, a call is made on page A, the user navigates to page B and then to page C
- **THEN** on page C the call from page A is restored and still marked as from a previous page

#### Scenario: Limit
- **WHEN** 300 records are saved and the new page has made 10 calls when the restore runs
- **THEN** the store has 300 records: the 10 new calls and the 290 newest saved records

### Requirement: Unfinished calls have an unknown outcome
A restored record whose state was `pending` or `streaming` when saved SHALL get state `unknown`, with no duration. Its input, attempts and events received before the page was left SHALL be kept. Records in state `unknown` SHALL NOT count as errors.

#### Scenario: Reload during a slow call
- **WHEN** Preserve log is on and the user reloads while a call is pending
- **THEN** the restored record's state is `unknown`, it has no duration, and it is not counted in the Errors filter or the dock badge

#### Scenario: Navigation during a stream
- **WHEN** the app navigates away after a stream delivered 3 events
- **THEN** the restored record's state is `unknown` and its events are the 3 events

### Requirement: No restore on a back/forward cache return
When a page returns from the back/forward cache (`pageshow` with `persisted` true), the system SHALL NOT restore saved records into it. It SHALL re-read the setting, and stop saving when Preserve log was turned off on a later page. It SHALL clear its store when the log was cleared on a later page.

#### Scenario: Back button
- **WHEN** Preserve log is on, the user navigates from page A to page B and presses Back, and page A returns from the back/forward cache
- **THEN** page A's store has each of its records once and no records restored from the saved copy

#### Scenario: Cleared on a later page
- **WHEN** Preserve log is on, the user navigates from page A to page B, clears the log on page B and presses Back, and page A returns from the back/forward cache
- **THEN** page A's list is empty, and a reload restores none of the records that existed before the clear

#### Scenario: Turned off on a later page
- **WHEN** the user turns Preserve log off on page B and presses Back to page A from the back/forward cache, and page A makes a call
- **THEN** nothing is written to sessionStorage

### Requirement: Clear removes the saved copy
Clearing the records SHALL also delete the saved records and cancel any pending save, so that cleared records do not come back after a reload or navigation. Counts of left-out records SHALL reset.

#### Scenario: Clear then reload
- **WHEN** Preserve log is on with 5 saved records, the user clears and reloads the page
- **THEN** no record is restored

#### Scenario: Clear then navigate
- **WHEN** Preserve log is on, the user clears, makes one call and navigates to another document
- **THEN** only that one call is restored

### Requirement: One saver per document
The system SHALL install the saver once per document: loading the page script again, or a hot module update of the app, SHALL NOT add another store subscription or page lifecycle listener, and SHALL NOT restore again.

#### Scenario: Hot update
- **WHEN** Preserve log is on and a module of the app is hot-updated
- **THEN** each record appears once, and the next call produces one record in the saved copy

### Requirement: Storage unavailable
When the page cannot access sessionStorage, the system SHALL report Preserve log as unavailable to the panel, record calls as usual, and SHALL NOT throw into the app.

#### Scenario: Storage blocked
- **WHEN** reading `sessionStorage` throws in the page
- **THEN** the panel shows Preserve log as unavailable, and calls are still recorded and shown
