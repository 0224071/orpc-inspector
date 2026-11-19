# Spec Delta

## MODIFIED Requirements

### Requirement: Error classification
The system SHALL classify failed calls into four kinds: output validation failure (`invalid` / `output`), input validation failure detected on the client (`invalid` / `input`), input validation failure reported by the server (`invalid` / `input` with issues source `server`), and other errors (`error`), recording the error's name and message, plus code, status and data for oRPC errors. Records without an issues source SHALL be treated as client validation failures. An oRPC error whose cause is a validation error SHALL count as a client input failure when its code is `BAD_REQUEST`, and as an output failure for any other code.

#### Scenario: Response does not match output schema
- **WHEN** ResponseValidationPlugin throws a validation error because the response does not match the schema
- **THEN** the record has state `invalid` and issuesOf `output`, issues contain each problem's path and message, and output is the raw data that failed validation

#### Scenario: Output validation error wrapped in an oRPC error
- **WHEN** a client plugin throws `INTERNAL_SERVER_ERROR` whose cause is a validation error for the response data (as oRPC v2's response validation plugin does)
- **THEN** the record has state `invalid` and issuesOf `output`, issues contain each problem's path and message, output is the raw data that failed validation, and error has code `INTERNAL_SERVER_ERROR`

#### Scenario: Input does not match schema
- **WHEN** RequestValidationPlugin refuses to send because the input does not match the schema
- **THEN** the record has state `invalid` and issuesOf `input`, and issues contain each problem's path and message

#### Scenario: Server rejects the input
- **WHEN** the server's input schema `z.object({ name: z.string().min(2) })` rejects `{ name: "A" }` and the client receives oRPC's `BAD_REQUEST` error with status 400 and `data.issues`
- **THEN** the record has state `invalid`, issuesOf `input` and issues source `server`, its issues contain path `["name"]`, code `too_small` and the server's message, and the record keeps status 400 and the error's code, status and data

#### Scenario: Backend returns 4xx
- **WHEN** the backend returns an oRPC error (e.g. status 404, code `NOT_FOUND`)
- **THEN** the record has state `error`, and error contains code, status and data
