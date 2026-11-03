# inspector-panel Specification

## Purpose

The DevTools panel UI: lets developers browse, filter and inspect oRPC call records, quickly locate schema validation issues, and turn them into a report ready to paste.

## Requirements

### Requirement: Call list
The panel SHALL list records newest first, each showing procedure, state, side, duration and HTTP status, and marking whether an invalid call failed on input or output schema and, for input, whether the client refused to send it or the server rejected it.

#### Scenario: Show list
- **WHEN** the store has 3 records
- **THEN** the panel shows the 3 records newest first, each with the fields above

#### Scenario: Server-rejected input in the list
- **WHEN** the store has a server input validation failure with status 400
- **THEN** the list shows it as invalid with status 400, marked as rejected by the server rather than not sent

### Requirement: Row state indicator
Each list row SHALL show its state with an indicator that looks different for each of `pending`, `streaming`, `success`, `error`, `invalid`, `cancelled`. The state SHALL NOT be shown by color alone: the indicator SHALL expose the localized state name as its accessible name and tooltip.

#### Scenario: States that are not finished or not successful
- **WHEN** the store has one `pending`, one `streaming` and one `cancelled` record
- **THEN** the three rows each have a different state indicator, and their accessible names are `Pending`, `Streaming` and `Cancelled`

#### Scenario: Localized state name
- **WHEN** the panel language is Traditional Chinese and the store has a `streaming` record
- **THEN** the row's state indicator is named `串流中`

### Requirement: Row side tag
A record from SSR SHALL show an `SSR` tag on its row. A row without it is a client call.

#### Scenario: Side
- **WHEN** the store has one record from SSR and one from the client
- **THEN** only the SSR record's row shows the `SSR` tag

### Requirement: Row invalid reason tag
An invalid row SHALL show exactly one localized tag: `Response` when the response failed the output schema, `Not sent` when the client refused to send the input, or `Server` when the server rejected the input.

#### Scenario: Invalid reason tags
- **WHEN** the store has an invalid call whose response failed the output schema, one whose input the client refused to send, and one whose input the server rejected
- **THEN** their rows show the tags `Response`, `Not sent` and `Server` respectively, and no row shows more than one of them

#### Scenario: Localized reason tag
- **WHEN** the panel language is Traditional Chinese and the store has an invalid call whose input the client refused to send
- **THEN** the row shows the tag `未送出`

### Requirement: Filter and search
The panel SHALL provide three filters, `all` / `error` / `invalid`, with their counts, and a keyword search that matches procedure and URL case-insensitively.

#### Scenario: Filter plus search
- **WHEN** `invalid` is selected and `Profile` is entered
- **THEN** only records with state `invalid` whose procedure or URL contains `profile` (case-insensitive) are shown

### Requirement: Call details
When a record is selected, the panel SHALL show method, URL, status, time, input and the response (output or error) as collapsible JSON trees, and list request / response headers in tables.

#### Scenario: Inspect a failed call
- **WHEN** a record with state `error` is selected
- **THEN** the details show the error's name, message, code, status and data

### Requirement: Locate validation issues
The panel SHALL group issues by path and show each group's count (array indices merged into a wildcard). When a group is clicked, the JSON tree SHALL expand and scroll to the matching location, and repeated clicks on the same group jump to the next one in turn.

#### Scenario: Multiple issues inside an array
- **WHEN** issues have paths `items.0.name` and `items.3.name`
- **THEN** one group `items.*.name` with count 2 is shown; the first click jumps to `items.0.name` and the second to `items.3.name`

### Requirement: Copy report
The panel SHALL copy the selected call, or all current errors, as a Markdown report whose content follows the chosen template; before copying it MUST mask sensitive fields according to the template's mask pattern. When the Clipboard API is unavailable, it copies by a fallback method.

#### Scenario: Copy a call containing a token
- **WHEN** a call whose input has a `token` field is copied with the default template
- **THEN** the value of `token` in the clipboard is `***`

### Requirement: Issues in copied reports
Issues of server input validation failures SHALL appear in the report's issues section in the same form as client issues, the request line SHALL show that the request was sent and its HTTP status, and calls whose issues come from different sources SHALL NOT be merged as duplicates. Each issue row, for client and server issues alike, SHALL show the issue's path, code (when the issue has one), message and sample value.

#### Scenario: Copy a server validation failure with a built-in template
- **WHEN** a server input validation failure for `{ name: "A" }` is copied with any built-in template
- **THEN** the report lists the issue's path `name`, its code `too_small`, its message and the sample value `"A"` in the issues section, and the request line shows status 400 instead of not sent

#### Scenario: Issue code in client issue rows
- **WHEN** a client input validation failure with a `too_small` issue at `name` is copied with a table template and with a list template
- **THEN** both reports show the code `too_small` in that issue's row next to its path and message

#### Scenario: Issue without a code
- **WHEN** a call whose issue has no code (a non-zod Standard Schema issue) is copied
- **THEN** the issue row shows its path, message and sample value without a code

#### Scenario: Template saved before this change
- **WHEN** a custom template saved by an earlier version with the issues section on is used to copy a server input validation failure
- **THEN** the report includes the issues section without any change to the saved template

### Requirement: Report template settings
The panel SHALL provide built-in templates and let users create and edit custom templates (syntax, sections, omission rules, length limit, mask pattern) in the `Report templates` category of the Settings view; the report menu's settings item SHALL open the Settings view on that category. Custom templates and the last used template SHALL be saved in the panel's localStorage and persist after reopening. An invalid mask pattern MUST show an error and fall back to the default pattern.

#### Scenario: Reopen the panel
- **WHEN** the user creates and uses a custom template, then reloads the panel
- **THEN** the custom template is still there, and the last used template is selected by default

#### Scenario: Open template settings from the report menu
- **WHEN** the user chooses the settings item in a report menu
- **THEN** the Settings view opens with the `Report templates` category selected

#### Scenario: Templates saved before this change
- **WHEN** the panel is opened with custom templates saved by an earlier version
- **THEN** those templates and the last used template are still available

### Requirement: Settings view
The panel SHALL provide a Settings button in the toolbar that opens a full-page Settings view in place of the call list and details. The view SHALL list its categories on the left, starting with `Display` and `Report templates`, show the selected category's settings on the right, and provide a Back control that returns to the panel. Filters, search, Headers expand/collapse and copy toggles SHALL stay in the panel and not appear in Settings.

#### Scenario: Open settings from the toolbar
- **WHEN** the user presses the Settings button in the toolbar
- **THEN** the Settings view replaces the panel with the `Display` category selected

#### Scenario: Return to the panel
- **WHEN** the user presses Back in the Settings view
- **THEN** the panel is shown again with the same filter, search keyword and selected call as before

### Requirement: Show headers display setting
The `Display` category SHALL provide a "Show headers" setting, on by default. When it is off, the call details SHALL NOT show the Request or Response Headers blocks, including their expand/collapse controls, copy toggles and tables. The setting SHALL be saved in the panel's localStorage and persist after reopening; a missing or unreadable saved value MUST fall back to the default.

#### Scenario: Hide headers
- **WHEN** the user turns off "Show headers" and selects a call
- **THEN** the call details show no Headers block under Request or Response, and the other sections are unchanged

#### Scenario: Reopen the panel
- **WHEN** the user turns off "Show headers" and reloads the panel
- **THEN** "Show headers" is still off and the Headers blocks stay hidden

#### Scenario: First use
- **WHEN** the panel is opened with no saved display settings
- **THEN** "Show headers" is on and the Headers blocks are shown

### Requirement: Clear records and connection status
The panel SHALL show its connection status with the page and provide a clear button that removes all records from the page-side store.

#### Scenario: Clear
- **WHEN** the user presses clear
- **THEN** both the panel list and the page-side store become empty

### Requirement: Language display setting
The `Display` category of the Settings view SHALL provide a Language setting with the choices following the browser, English and Traditional Chinese, where the browser choice shows which language it currently resolves to. The setting behaves as defined in `panel-localization`.

#### Scenario: Change language in Settings
- **WHEN** the user opens Settings, stays on `Display`, and chooses Traditional Chinese
- **THEN** the Settings view and, after Back, the panel are shown in Traditional Chinese

#### Scenario: Browser choice label
- **WHEN** the browser language is `zh-TW` and the Language setting follows the browser
- **THEN** the setting shows that it currently resolves to Traditional Chinese

### Requirement: Translated issue messages
Where the panel shows a validation issue message (issue groups and the JSON tree), it SHALL show the translated message when the issue has one, and SHALL provide access to the original message for that issue. Issues without a translation SHALL show the original message unchanged.

#### Scenario: Translated issue in the group list
- **WHEN** a selected call has an issue translated to Traditional Chinese
- **THEN** the issue group shows the Traditional Chinese message and the user can reveal the original message

#### Scenario: No translation
- **WHEN** a selected call's issues have no translation
- **THEN** the panel shows the original messages exactly as before this change

#### Scenario: Copy report with translated issues
- **WHEN** a call with translated issues is copied as a report with a template whose issue-message option is original only
- **THEN** the report uses the original issue messages

### Requirement: Issue message option in report templates
Report templates SHALL provide an issue-message option with the choices original only, translated, and translated followed by the original. Original only SHALL be the default for built-in templates and for saved templates that lack the option. The option SHALL change only the messages of issues that have a translation; issues without one SHALL use the original message under every choice. The option SHALL NOT change how duplicate calls are merged or how issues are grouped.

#### Scenario: Translated choice
- **WHEN** a call with an issue translated to Traditional Chinese is copied with a template set to translated
- **THEN** the report shows that issue's Traditional Chinese message

#### Scenario: Both choice
- **WHEN** the same call is copied with a template set to translated followed by the original
- **THEN** the report shows the Traditional Chinese message followed by the original message

#### Scenario: No translation available
- **WHEN** `zodLocale` is not set and a call is copied with a template set to translated
- **THEN** the report uses the original issue messages

#### Scenario: Template saved by an earlier version
- **WHEN** the panel loads a custom template saved before this option existed
- **THEN** the template's issue-message option is original only

### Requirement: Server validation issue details
When a server input validation failure is selected, the panel SHALL show its issues with the same grouping, click-to-locate in the input tree and translated messages as client input issues, under a heading that says the server rejected the input, and SHALL still show the HTTP status, the error's name, code and message, and the error data as the response. Issues whose path is not in the recorded input are the exception (see "Server issues outside the recorded input").

#### Scenario: Inspect a server validation failure
- **WHEN** a server input validation failure with an issue at `name` is selected
- **THEN** the details show the issue group `name` under the server heading, clicking it scrolls to `name` in the input tree, and the response shows the error data with status 400

### Requirement: Disconnected panel lists causes and retries
When the panel is not connected to the page, it SHALL show a diagnostic state instead of the call list. The state SHALL include a waiting headline, all three causes (the app page is not open, the client script is not loaded, the panel URL was opened on its own rather than from the DevTools dock), and a retry control that reloads the panel. English and Traditional Chinese SHALL both provide this copy. When the panel is connected, this state SHALL NOT be shown.

#### Scenario: Panel URL opened on its own
- **WHEN** the user opens the panel URL as a top-level page with no opener
- **THEN** the panel shows the diagnostic state with all three causes and does not show call records

#### Scenario: Retry
- **WHEN** the user activates retry on the diagnostic state
- **THEN** the panel reloads and starts the connection attempt again

#### Scenario: Connected
- **WHEN** the panel is connected to the page
- **THEN** the diagnostic state is not shown and the call list is shown

### Requirement: Disconnected panel marks the matching cause
While the diagnostic state is shown, the panel SHALL mark the cause that matches how it was opened. With no parent frame and no opener, it SHALL mark the standalone-URL cause. With a parent frame or an opener, and still not connected after a short wait, it SHALL mark the client-script cause. The other causes SHALL stay listed.

#### Scenario: Standalone page
- **WHEN** the panel URL is open as a top-level page with no opener
- **THEN** the standalone-URL cause is marked and the other two causes are still listed

#### Scenario: Embedded and still disconnected
- **WHEN** the panel is inside a parent frame or was opened from another window, and it is still not connected after a short wait
- **THEN** the client-script cause is marked and the other two causes are still listed

### Requirement: Narrow panel layout
When the panel's own width is below 640 px, the panel SHALL show one column instead of the call list and details side by side. The width that counts is the panel's, not the app page's viewport. At 640 px and wider, the layout SHALL stay as it is.

#### Scenario: Phone-width panel shows the list first
- **WHEN** the panel is 390 px wide and has 3 records, none selected
- **THEN** the call list fills the panel width and no details column is shown

#### Scenario: Narrow dock on a wide page
- **WHEN** the app page is 1280 px wide but the dock gives the panel 500 px
- **THEN** the panel uses the one-column layout

#### Scenario: Wide panel unchanged
- **WHEN** the panel is 900 px wide and a record is selected
- **THEN** the list and details are shown side by side with no back control

### Requirement: Switch between list and details in the narrow layout
In the narrow layout, selecting a call SHALL replace the list with that call's details at full width, with a back control at the top. The back control SHALL return to the list with the call still highlighted. If the shown call is removed, the panel SHALL return to the list. English and Traditional Chinese SHALL both provide the back control's label.

#### Scenario: Select and go back
- **WHEN** the user selects a record in a 390 px wide panel, then activates the back control
- **THEN** the details are shown at full width with the back control at the top, and after going back the list is shown with that record highlighted

#### Scenario: Shown call is cleared
- **WHEN** the details of a record are shown in a narrow panel and the user clears all records
- **THEN** the panel shows the empty list

### Requirement: Keyboard focus in the narrow layout
Records SHALL be selectable from the keyboard with Enter or Space. Keyboard focus SHALL stay on a shown element: selecting a call in the narrow layout moves focus to the back control, going back moves it to the highlighted record, and when the panel crosses 640 px focus moves out of a section that becomes hidden or removed.

#### Scenario: Keyboard focus follows the shown section
- **WHEN** the user selects a record with Enter in a 390 px wide panel, then activates the back control
- **THEN** focus is on the back control while the details are shown, and on the highlighted record after going back

#### Scenario: Focus when the panel widens
- **WHEN** focus is on the back control in a narrow panel and the panel widens to 640 px or more
- **THEN** focus moves to the highlighted record in the list

### Requirement: Toolbar and Settings in the narrow layout
In the narrow layout, every toolbar control (filters, search, copy error report, clear, settings) SHALL stay reachable without horizontal scrolling, with the search field on its own full-width row. The Settings view SHALL stack its category navigation above the content.

#### Scenario: Toolbar at 360 px
- **WHEN** the panel is 360 px wide
- **THEN** the filters, search, copy error report, clear and settings controls are all inside the panel width, and the search field has its own row

#### Scenario: Settings at 360 px
- **WHEN** the user opens Settings in a 360 px wide panel
- **THEN** the categories are shown above the settings content and nothing scrolls horizontally

### Requirement: Headers inside error data
When the response tree shows error data that carries response headers (`data.headers`, as from a non-oRPC backend), the panel SHALL mask headers matching the current template's mask pattern like the Headers section: `***` with a reveal control when kept in the record, `***` with no reveal control when masked at record time. A revealed value SHALL stay revealed until another call is selected. Other keys SHALL be shown as they are.

#### Scenario: Dev record from a non-oRPC backend
- **WHEN** a dev server record's error data has `headers.authorization` `Bearer x` and `headers.x-request-id` `req-1`
- **THEN** the response tree shows `authorization` as `***` with a reveal control that shows `Bearer x`, and `x-request-id` as `req-1`

#### Scenario: Masked at record time
- **WHEN** an opted-in production record's error data has `headers.authorization` recorded as `***`
- **THEN** the response tree shows `***` with no reveal control

#### Scenario: Switch template while revealed
- **WHEN** the user reveals `authorization` in the error data, then picks another report template
- **THEN** `authorization` stays revealed

#### Scenario: Select another call
- **WHEN** the user reveals `authorization` in the error data, selects another call, then selects the first call again
- **THEN** `authorization` is shown as `***` again

### Requirement: Selected call hidden by the search or a filter
When the search keyword or the `all` / `error` / `invalid` filter hides the selected call, the panel SHALL stop showing that call's details and SHALL show a notice that the selected call is not in the current results, in English and Traditional Chinese. The selection SHALL be kept: once the search or filter shows the call again, its row SHALL be highlighted and its details shown again without another selection.

#### Scenario: Search hides the selected call
- **WHEN** records `createUser` and `hello` exist, `createUser` is selected in a 900 px wide panel, and the user enters `hello` in the search
- **THEN** the list shows only `hello`, no row is highlighted, and the details column shows the not-in-results notice instead of `createUser`'s details

#### Scenario: Clearing the search restores the selection
- **WHEN** the search has hidden the selected `createUser` and the user clears the search
- **THEN** `createUser` is highlighted again and its details are shown

#### Scenario: Filter hides the selected call
- **WHEN** a successful record is selected in a wide panel and the user switches to the `error` filter
- **THEN** the details column shows the not-in-results notice, and switching back to `all` shows that record's details again

### Requirement: Hidden selection in the narrow layout
In the narrow layout, when the search or a filter hides the selected call, the panel SHALL show the list. When the call is shown again, its row SHALL be highlighted but the panel SHALL stay on the list until the user selects a call.

#### Scenario: Search in the narrow details
- **WHEN** the details of `createUser` are shown in a 390 px wide panel and the user enters `hello` in the search
- **THEN** the panel shows the list with only `hello` and no back control

#### Scenario: Selection comes back in the narrow list
- **WHEN** the search has hidden the selected `createUser` in a 390 px wide panel and the user clears the search
- **THEN** the list is shown with `createUser` highlighted, and the details are not shown until a record is selected

### Requirement: Server issues outside the recorded input
For a server input validation failure, an issue whose path does not exist in the recorded input SHALL NOT add a row to the input tree. Such issues SHALL be grouped as usual and listed in a separate block under the server heading, labelled as not in the recorded input, in English and Traditional Chinese. Their groups SHALL NOT offer jumping to the tree. Issues whose path exists in the recorded input SHALL stay in the main list.

#### Scenario: Server issues for fields that were not sent
- **WHEN** the input `{ "id": "orpc-400" }` is rejected by the server with issues at `email` and `age`
- **THEN** the input tree shows only `id`, and the groups `email` and `age` are listed in the block for issues not in the recorded input, without a jump action

#### Scenario: Server issues both inside and outside the recorded input
- **WHEN** the input `{ "name": "A" }` is rejected by the server with issues at `name` and `email`
- **THEN** the group `name` is in the main list and jumps to `name` in the input tree, which shows the issue mark, and the group `email` is in the block for issues not in the recorded input

#### Scenario: Array items outside the recorded input
- **WHEN** the input `{ "items": [{ "sku": "a" }] }` is rejected by the server with issues at `items.0.sku` and `items.2.sku`
- **THEN** the main list has the group for `items.0.sku`, the block for issues not in the recorded input has the group for `items.2.sku`, and the input tree shows only the one recorded item

### Requirement: Missing fields of client issues
For client input and output validation failures, when an issue's path names a direct child that the object at its parent path lacks, the JSON tree SHALL show that child as a row marked as missing, carrying the issue. Clicking the issue's group SHALL jump to that row.

#### Scenario: Required field missing from the client input
- **WHEN** a client input validation failure for `{ "id": "a" }` has an issue at `email`
- **THEN** the input tree shows an `email` row marked as missing with the issue, and clicking the group `email` jumps to that row

### Requirement: Empty call list states
When the call list has no rows, the panel SHALL tell two states apart, in English and Traditional Chinese. When the page-side store has no records, the list SHALL show "No calls yet" ("還沒有呼叫"). When records exist but the search keyword and the `all` / `error` / `invalid` filter match none of them, the list SHALL show "No matching calls" ("沒有符合的呼叫") instead.

#### Scenario: No records
- **WHEN** the panel is connected and no call has been recorded
- **THEN** the list shows "No calls yet"

#### Scenario: Search matches nothing
- **WHEN** a record for `hello` exists and the user enters `zzz` in the search
- **THEN** the list shows "No matching calls" and not "No calls yet"

#### Scenario: Filter matches nothing
- **WHEN** only successful records exist and the user switches to the `error` filter
- **THEN** the list shows "No matching calls"

#### Scenario: Clearing the search shows the records again
- **WHEN** the search `zzz` matches nothing and the user clears the search
- **THEN** the list shows the records and no empty message

#### Scenario: Clear records while a search is active
- **WHEN** the search `zzz` matches nothing and the user presses clear
- **THEN** the list shows "No calls yet"

#### Scenario: Traditional Chinese
- **WHEN** the panel language is Traditional Chinese, records exist and the search matches none of them
- **THEN** the list shows "沒有符合的呼叫"

### Requirement: Reset the search and filter from the empty list
When the list shows "No matching calls", it SHALL also show a "Clear search and filter" ("清除搜尋與篩選") button. Pressing it SHALL empty the search keyword and set the filter to `all`, so every record shows again, and SHALL move focus to the selected row if it is shown, otherwise to the first row. The button SHALL be a native button that works with the keyboard. When the list shows "No calls yet", the button SHALL NOT be shown.

#### Scenario: Reset restores the list
- **WHEN** a successful record for `hello` exists, the search is `zzz`, the `error` filter is active, and the user presses "Clear search and filter"
- **THEN** the search box is empty, the `all` filter is active, the list shows `hello`, and no empty message is shown

#### Scenario: Focus after the reset
- **WHEN** records exist, the search matches nothing, and the user activates "Clear search and filter" with the keyboard
- **THEN** focus moves to the selected row if it is shown, otherwise to the first row of the list

#### Scenario: No button without records
- **WHEN** the list shows "No calls yet", with or without a search keyword
- **THEN** no "Clear search and filter" button is shown

#### Scenario: Traditional Chinese button
- **WHEN** the panel language is Traditional Chinese, records exist and the search matches none of them
- **THEN** the list shows a "清除搜尋與篩選" button

### Requirement: Color scheme follows the dock theme
The panel SHALL use the color scheme set in the DevTools dock's theme setting: dark when the dock is set to dark, light when it is set to light, regardless of the system preference. When the dock is set to auto, or the panel cannot read the dock setting or does not recognize its value, the panel SHALL follow the system color scheme preference. The panel SHALL NOT add styles or elements to the app page.

#### Scenario: Dock set to light on a dark system
- **WHEN** the system prefers dark and the dock theme is set to light
- **THEN** the panel opens with the light color scheme

#### Scenario: Dock set to dark on a light system
- **WHEN** the system prefers light and the dock theme is set to dark
- **THEN** the panel opens with the dark color scheme

#### Scenario: Dock set to auto
- **WHEN** the dock theme is set to auto and the system prefers dark
- **THEN** the panel uses the dark color scheme, and switches to light when the system preference changes to light

#### Scenario: No dock setting
- **WHEN** the dock has never stored a theme setting and the system prefers light
- **THEN** the panel uses the light color scheme

#### Scenario: Unrecognized dock setting
- **WHEN** the stored dock theme setting is a value other than auto, light or dark
- **THEN** the panel follows the system color scheme preference

#### Scenario: App page untouched
- **WHEN** the dock theme is set to dark and the panel is open
- **THEN** the app page's root element has no class, attribute or style added by the inspector

### Requirement: Dock theme changes apply without reload
While the panel is open, a change to the dock's theme setting SHALL update the panel's color scheme right away, without reloading the panel or losing its records, selection or view.

#### Scenario: Switch dock theme while the panel is open
- **WHEN** the panel is open in light with a call selected, and the user switches the dock theme to dark
- **THEN** the panel turns dark without a reload, and the same call stays selected

#### Scenario: Switch dock theme back to auto
- **WHEN** the dock theme is dark on a light system, and the user switches it to auto
- **THEN** the panel turns light without a reload

### Requirement: Code block language tag option
Report templates SHALL provide a code block language-tag option. When code blocks are on and the option is on, JSON code blocks SHALL open with ```` ```json ````; when the option is off, every code block SHALL open with a bare ```` ``` ````. The option SHALL have no effect when code blocks are off. Saved custom templates that lack the option SHALL behave as if it is on.

#### Scenario: Language tag on
- **WHEN** a call with a response is copied with the built-in Markdown template
- **THEN** the response code block opens with ```` ```json ````

#### Scenario: Language tag off
- **WHEN** a call with a response is copied with a template that has code blocks on and the language tag off
- **THEN** the response code block opens with ```` ``` ```` and the report does not contain ```` ```json ````

#### Scenario: Custom template saved before this option existed
- **WHEN** the panel loads a custom template with code blocks on that was saved before this option existed
- **THEN** its reports still open JSON code blocks with ```` ```json ````

### Requirement: Inline code with several asterisks
Report templates SHALL provide an option that skips the backticks of inline code whose text has two or more `*`. When inline code and the option are on, such text SHALL be written without backticks, and text with at most one `*` SHALL still be wrapped. The option SHALL have no effect when inline code is off. Saved templates that lack the option SHALL behave as if it is off.

#### Scenario: Masked value with the option on
- **WHEN** a call whose issue has the masked actual value `"***"` is copied with a template that has inline code and the option on
- **THEN** the report shows `"***"` without backticks

#### Scenario: Path with one asterisk
- **WHEN** a call with an issue at `data[*].zip` is copied with a template that has inline code and the option on
- **THEN** the path is wrapped in single backticks

#### Scenario: Option off
- **WHEN** the same masked value is copied with the built-in Discord template
- **THEN** the report shows it wrapped in backticks as before

### Requirement: LINE built-in template syntax
The built-in LINE template SHALL use inline code with the asterisk option on and code blocks without a language tag, and SHALL NOT use headings, bold, tables or HTML. The `Plain text` syntax preset SHALL keep inline code and code blocks off.

#### Scenario: Copy an invalid call with the LINE template
- **WHEN** a call whose response does not match the schema is copied with the built-in LINE template
- **THEN** the procedure name and issue paths are wrapped in single backticks, the input and response are in ```` ``` ```` code blocks without a language tag, and the report contains no `#` headings, `**` bold, tables or `<details>`

#### Scenario: Copy a masked value with the LINE template
- **WHEN** a call whose issue has the masked actual value `"***"` is copied with the built-in LINE template
- **THEN** the report shows `"***"` without backticks

#### Scenario: Plain text preset
- **WHEN** a template uses the `Plain text` syntax preset
- **THEN** its report contains no backticks
