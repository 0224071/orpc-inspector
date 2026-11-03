# panel-localization Specification

## Purpose

Let developers use the DevTools panel UI in English or Traditional Chinese, chosen automatically from the browser language or set explicitly, without affecting the inspected app.

## Requirements

### Requirement: Supported UI languages
The panel SHALL provide its UI in English (`en`) and Traditional Chinese (`zh-TW`). All user-facing panel text — labels, buttons, placeholders, tooltips, empty states, state names and settings descriptions — SHALL come from the active language; none is hard-coded in one language.

#### Scenario: Panel in Traditional Chinese
- **WHEN** the active language is `zh-TW` and the panel shows the call list, call details and Settings view
- **THEN** every UI label, button, placeholder, tooltip and empty-state message is shown in Traditional Chinese

#### Scenario: Panel in English
- **WHEN** the active language is `en`
- **THEN** every UI text is shown in English

### Requirement: Default language follows the browser
When the user has not chosen a language, the panel SHALL use `zh-TW` if the browser language is Chinese (`zh` or any `zh-*` tag) and `en` otherwise.

#### Scenario: Chinese browser, first use
- **WHEN** the panel is opened with no saved language and the browser language is `zh-TW`
- **THEN** the panel is shown in Traditional Chinese

#### Scenario: Other browser language, first use
- **WHEN** the panel is opened with no saved language and the browser language is `fr-FR`
- **THEN** the panel is shown in English

### Requirement: Language choice is persisted
The user's language choice SHALL be saved in the panel's localStorage and applied after reopening. The choice offers `en`, `zh-TW`, and following the browser. A missing, unknown or unreadable saved value MUST fall back to following the browser.

#### Scenario: Reopen after choosing English
- **WHEN** the browser language is `zh-TW`, the user chooses English, and reloads the panel
- **THEN** the panel is shown in English

#### Scenario: Unknown saved value
- **WHEN** the saved language is `xx`
- **THEN** the panel follows the browser language

### Requirement: Language applies immediately
Changing the language SHALL update all visible panel text immediately, without reloading the panel and without losing the current filter, search keyword, selected call or Settings category.

#### Scenario: Switch while a call is selected
- **WHEN** a call is selected and the user switches the language in Settings, then presses Back
- **THEN** the panel text is in the new language and the same call is still selected

### Requirement: Language-dependent formatting
The panel SHALL format displayed times according to the active language, always as a 24-hour clock, and SHALL set the panel document's language attribute to the active language.

#### Scenario: Times in English
- **WHEN** the active language is `en`
- **THEN** call times are formatted for `en` as a 24-hour clock (for example `14:30:31`) and the document language is `en`

### Requirement: Scope of UI language
The UI language SHALL NOT change recorded data, user-defined template names, schema validation messages, or the content of copied reports; reports remain in English.

#### Scenario: Copy a report in Chinese UI
- **WHEN** the active language is `zh-TW` and the user copies a report
- **THEN** the report text is the same as when the active language is `en`
