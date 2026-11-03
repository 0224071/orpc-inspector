# issue-translation Specification

## Purpose

Show zod's default validation messages in the panel in a locale chosen by the developer, using the zod installed in the user's project, while keeping the original message and leaving the app's own zod language unchanged.

## Requirements

### Requirement: zodLocale option
The Vite plugin and the Nuxt module SHALL accept an optional `zodLocale` option naming a zod locale (for example `zh-TW`). When it is set, the system SHALL translate issue messages using that locale from the zod package installed in the user's project. When it is not set, no translation SHALL happen.

#### Scenario: zodLocale set
- **WHEN** the project uses `orpcInspector({ zodLocale: 'zh-TW' })` and an output validation fails with zod's default message `Invalid input: expected string, received number`
- **THEN** the panel shows that issue as `無效的輸入值：預期為 string，但收到 number`

#### Scenario: zodLocale not set
- **WHEN** the project uses `orpcInspector()` and a validation fails
- **THEN** the panel shows only the original message

### Requirement: App zod configuration is untouched
Translation SHALL NOT change zod's global configuration or any message the app itself receives from zod; only the copy of a record sent to the panel carries the translation.

#### Scenario: App reads its own error
- **WHEN** `zodLocale` is `zh-TW` and the app catches a zod validation error from its own code
- **THEN** the app's error messages are the same as without the option

#### Scenario: Recorded original stays unchanged
- **WHEN** a translated issue is shown in the panel
- **THEN** the recorded issue's `message` is still the original message

### Requirement: Only default messages are translated
The system SHALL translate an issue only when its recorded message equals the message zod produces by default for that issue. For issues detected on the client, the default is what the app's zod configuration produces; when the app has not set a zod locale yet, zod's `en` messages and `Invalid input` count as the default. Messages set by the user (on the schema, the check or globally as a custom error) SHALL be shown as recorded.

#### Scenario: Custom message
- **WHEN** a schema is `z.string({ error: 'Name is required' })` and validation fails
- **THEN** the panel shows `Name is required` without a translation

#### Scenario: Records published before the app loads zod
- **WHEN** `zodLocale` is `zh-TW` and SSR records with zod's default English messages are published before the app's own modules import zod
- **THEN** those issues are translated to Traditional Chinese

#### Scenario: App already uses a non-English zod locale
- **WHEN** the app configured zod with the `ja` locale and `zodLocale` is `zh-TW`
- **THEN** zod's default Japanese messages are translated to Traditional Chinese

### Requirement: Default messages for server-reported issues
For issues reported by the server, whose zod configuration the browser cannot see, the default message SHALL be zod's `en` message or the message the app's zod locale produces, and the app's custom error SHALL NOT be consulted.

#### Scenario: Server on default zod settings while the app uses another locale
- **WHEN** the app configured zod with the `ja` locale, `zodLocale` is `zh-TW`, and the server rejects input with zod's default English message
- **THEN** that server issue is translated to Traditional Chinese

#### Scenario: Custom message from the server
- **WHEN** `zodLocale` is `zh-TW` and the server rejects input with the check message `custom msg`
- **THEN** the panel shows `custom msg` without a translation

### Requirement: Received type for type errors
For `invalid_type` issues, the system SHALL determine the received type from the value at the issue's path in the recorded input (for input issues) or output (for output issues). When the received type cannot be determined consistently with the original message, the issue SHALL be shown untranslated.

#### Scenario: Wrong type at a nested path
- **WHEN** output `{ user: { age: "12" } }` fails `age: z.number()` with zod's default message
- **THEN** the translated message says it expected number and received string

#### Scenario: Missing field
- **WHEN** a required field is absent from the output
- **THEN** the translated message says it received undefined

### Requirement: Original message stays available
For every translated issue, the panel SHALL show the translated message by default and SHALL let the user see the original message.

#### Scenario: See the original
- **WHEN** a translated issue is shown
- **THEN** the user can reveal the original English message for that issue without leaving the call details

### Requirement: Fallback to the original
The system SHALL show the original message only, without errors or broken pages, when `zodLocale` is not set, when zod is not installed in the project, when the named locale cannot be resolved, or when an issue is not a zod issue. An unresolvable locale SHALL produce one warning in the dev server log.

#### Scenario: zod not installed
- **WHEN** `zodLocale` is `zh-TW` but the project does not have zod installed
- **THEN** the dev server starts, logs one warning, and the panel shows original messages

#### Scenario: Unknown locale
- **WHEN** `zodLocale` is `xx-YY`
- **THEN** the dev server logs one warning and the panel shows original messages

#### Scenario: Non-zod schema
- **WHEN** a validation issue comes from a non-zod Standard Schema library
- **THEN** the panel shows the original message

### Requirement: Independent from UI language
`zodLocale` and the panel UI language SHALL be set independently; changing one SHALL NOT change the other.

#### Scenario: English UI with Chinese issues
- **WHEN** `zodLocale` is `zh-TW` and the panel UI language is `en`
- **THEN** the panel UI is in English and zod default messages are in Traditional Chinese

### Requirement: SSR records are translated in the browser
Issues of records collected during SSR SHALL be translated in the browser after hydration, in the same way as client records.

#### Scenario: SSR validation failure
- **WHEN** `zodLocale` is `zh-TW` and an SSR call fails output validation with a default message
- **THEN** after hydration the panel shows that SSR record's issue translated

### Requirement: Server-reported issues are translated
Issues of server input validation failures SHALL be translated in the browser in the same way as client issues, using the recorded input to determine the received type, and SHALL fall back to the original message under the same conditions.

#### Scenario: Server rejects a too-short string
- **WHEN** `zodLocale` is `zh-TW` and the server rejects `{ name: "A" }` for `z.string().min(2)` with `Too small: expected string to have >=2 characters`
- **THEN** the panel shows that issue in Traditional Chinese and the user can reveal the original message

#### Scenario: Server type error
- **WHEN** `zodLocale` is `zh-TW`, the input is `{ age: "1" }` and the server rejects it for `z.number()` with zod's default message
- **THEN** the translated message says it expected number and received string

#### Scenario: Received type differs on the server
- **WHEN** the input the client recorded has a different type at the issue path than the value the server validated, so the rebuilt default message differs from the server's message
- **THEN** the panel shows the server's original message only
