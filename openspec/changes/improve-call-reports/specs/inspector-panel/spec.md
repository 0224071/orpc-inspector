## ADDED Requirements

### Requirement: Diagnostic layout for report templates
A report template SHALL offer a diagnostic layout without changing the default layout of built-in or saved templates. The diagnostic layout SHALL surface the captured request context, first available failure evidence, and reproduction context before large payloads. It SHALL follow the selected platform's syntax, masking and section switches, and SHALL NOT present missing or partial inputs as replayable requests.

#### Scenario: Copy a client validation failure
- **WHEN** a call blocked by client input validation is copied with the diagnostic layout and Request and Issues enabled
- **THEN** the first lines name the procedure, distinguish not sent from an HTTP response, and identify the first issue with its path before the issue list or payload

#### Scenario: Copy with details disabled
- **WHEN** Issues and Input are disabled for a diagnostic report
- **THEN** its summary does not show issue details or suggest using an input shown in that report

#### Scenario: Constrain a report's length
- **WHEN** a diagnostic report with JSON payloads exceeds a template's length limit
- **THEN** the formatter tries compact JSON before dropping sections, and reports that evidence was omitted when reducing the content to fit

### Requirement: Preview a report template without errors
The Report templates category SHALL make it clear that creating a custom template copies the current template independently of the original. It SHALL update the displayed preview when format options change, using visible errors when available, otherwise a selected call or a synthetic example.

#### Scenario: Customize a new template on an empty panel
- **WHEN** the user copies a template and changes a syntax option with no calls recorded
- **THEN** the synthetic preview reflects the new syntax immediately and the original template remains unchanged
