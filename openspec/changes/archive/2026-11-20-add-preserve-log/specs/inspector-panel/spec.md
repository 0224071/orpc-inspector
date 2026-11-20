# Spec Delta

## ADDED Requirements

### Requirement: Preserve log toggle
The toolbar SHALL show a "Preserve log" ("保留紀錄") checkbox next to the clear button that reflects and changes the page's Preserve log setting. When the page reports Preserve log as unavailable, the checkbox SHALL be disabled and its tooltip SHALL say that the page cannot use sessionStorage.

#### Scenario: Turn on
- **WHEN** the user ticks "Preserve log"
- **THEN** the page's Preserve log setting is on, and the checkbox stays ticked after the page is reloaded and the panel reconnects

#### Scenario: Unavailable
- **WHEN** the page reports Preserve log as unavailable
- **THEN** the checkbox is disabled and its tooltip explains why

### Requirement: Preserve log status
While Preserve log is on, the toolbar SHALL show "Partially preserved" ("部分未保存") next to the checkbox when records were left out of the saved copy, including ones left out on earlier pages, or saved without their bodies. Its tooltip SHALL give both counts. When the last write failed, it SHALL show "Not preserved: storage is full" ("未保存：儲存空間已滿") instead. Clearing the records SHALL remove the note.

#### Scenario: Large responses
- **WHEN** Preserve log is on and two records were saved as summaries
- **THEN** the toolbar shows "Partially preserved", and its tooltip says 2 calls were saved without their bodies

#### Scenario: After a reload
- **WHEN** records were left out of the saved copy, and the page is reloaded
- **THEN** the toolbar still shows "Partially preserved" until the user clears

#### Scenario: Write failed
- **WHEN** the last save failed because sessionStorage is full
- **THEN** the toolbar shows "Not preserved: storage is full"

### Requirement: Records from a previous page
A row restored from a previous page SHALL show a "Previous page" ("前一頁") tag, and its details SHALL say "From a previous page" ("來自前一個頁面"). Header values that are `***` in such a record SHALL show no reveal control.

#### Scenario: After a navigation
- **WHEN** Preserve log is on, a call to `auth.login` is made and the app navigates to another document
- **THEN** the `auth.login` row shows the "Previous page" tag, and rows of calls made after the navigation do not

#### Scenario: Masked header
- **WHEN** a restored record whose `authorization` was saved as `***` is selected and its request headers are expanded
- **THEN** `authorization` shows `***` with no reveal control

### Requirement: Outcome unknown in details
When a record in state `unknown` is selected, the details SHALL say that the page was left before the call finished, so its outcome is unknown, and SHALL show the input, attempts and events it has.

#### Scenario: Unfinished call
- **WHEN** a restored record in state `unknown` is selected
- **THEN** the details say the page was left before the call finished, and show no duration and no error

### Requirement: Parts not preserved
When a restored record was saved as a summary, the details SHALL show, in place of each left-out input, output, events or error data, that it was not preserved, with the record's size and the per-record limit.

#### Scenario: Large response
- **WHEN** a restored record whose output was left out is selected
- **THEN** the Response part says the output was not preserved because the record was over 64 KB, with its size

### Requirement: Previous-page records in copied reports
A copied report SHALL mark a record restored from a previous page in its request line, as `(Client · from a previous page)` or `(SSR · from a previous page)`, under the Request section. A record in state `unknown` SHALL be titled `Outcome unknown (page left before the call finished)`. A left-out part SHALL read `(not preserved: <size>, over the 64 KB limit)` in place of its value.

#### Scenario: Copy a restored error
- **WHEN** a restored `auth.login` record with state `error` is copied with the built-in Markdown template
- **THEN** the report's request line contains `from a previous page`

#### Scenario: Copy a restored summary
- **WHEN** a restored record whose output was left out is copied with the Response section on
- **THEN** the response reads `(not preserved: <size>, over the 64 KB limit)`

### Requirement: Previous-page records in the errors report
The errors report SHALL NOT include records in state `unknown`, and SHALL NOT merge an error from a previous page with the same error from the current page.

#### Scenario: Copy errors across a navigation
- **WHEN** the same 401 error happened once before a navigation and once after it, and the errors report is copied
- **THEN** the report lists them separately, and only the first is marked as from a previous page

#### Scenario: Unknown records in the errors report
- **WHEN** the store has one `error` record and one `unknown` record, and the errors report is copied
- **THEN** the report contains only the `error` record

## MODIFIED Requirements

### Requirement: Row state indicator
Each list row SHALL show its state with an indicator that looks different for each of `pending`, `streaming`, `success`, `error`, `invalid`, `cancelled`, `unknown`. The state SHALL NOT be shown by color alone: the indicator SHALL expose the localized state name as its accessible name and tooltip.

#### Scenario: States that are not finished or not successful
- **WHEN** the store has one `pending`, one `streaming` and one `cancelled` record
- **THEN** the three rows each have a different state indicator, and their accessible names are `Pending`, `Streaming` and `Cancelled`

#### Scenario: Localized state name
- **WHEN** the panel language is Traditional Chinese and the store has a `streaming` record
- **THEN** the row's state indicator is named `串流中`

#### Scenario: Outcome unknown
- **WHEN** the store has one `pending` record and one `unknown` record
- **THEN** the two rows have different state indicators, and the `unknown` one is named `Outcome unknown` (`結果未知` in Traditional Chinese)

### Requirement: Toolbar and Settings in the narrow layout
In the narrow layout, every toolbar control (filters, search, copy error report, clear, Preserve log, settings) SHALL stay reachable without horizontal scrolling, with the search field on its own full-width row. The Settings view SHALL stack its category navigation above the content.

#### Scenario: Toolbar at 360 px
- **WHEN** the panel is 360 px wide
- **THEN** the filters, search, copy error report, clear, Preserve log and settings controls are all inside the panel width, and the search field has its own row

#### Scenario: Settings at 360 px
- **WHEN** the user opens Settings in a 360 px wide panel
- **THEN** the categories are shown above the settings content and nothing scrolls horizontally
