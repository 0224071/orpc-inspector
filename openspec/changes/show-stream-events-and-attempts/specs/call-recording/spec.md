# Spec Delta

## MODIFIED Requirements

### Requirement: Record streaming output
When a procedure returns an event iterator, the system SHALL update the record as the caller consumes it: `streaming` while consuming, received events recorded in order (each record keeps only the last 100 events and records the total event count), `success` on normal completion, `error` on failure, and `cancelled` when the consumer stops early or the call's abort signal is aborted. The wrapping SHALL NOT change iterator behavior, and on early stop the upstream iterator also receives `return()`.

#### Scenario: Fully consumed
- **WHEN** the procedure yields 1, 2, 3 and ends, and the caller reads all of them with `for await`
- **THEN** the record's events are `[1, 2, 3]` and state is `success`

#### Scenario: Early stop
- **WHEN** the caller `break`s after the first event
- **THEN** the record's state is `cancelled`, and the upstream iterator's `return()` is called

#### Scenario: Events exceed the limit
- **WHEN** the procedure yields 150 events and the caller reads all of them
- **THEN** the record's events are the last 100 events, and the total event count is 150

#### Scenario: Failure after some events
- **WHEN** the procedure yields 0 and 1, then throws
- **THEN** the record's state is `error`, its error is recorded, and its events are `[0, 1]`

### Requirement: Records are serializable
The system SHALL ensure records can be structured-cloned and JSON-serialized: bigint becomes a `"<number>n"` string, Blob / File becomes `[<class> <size> bytes]`, a `Map` becomes an array of `[key, value]` entries, a `Set` becomes an array of its values, and values that cannot be serialized become strings.

#### Scenario: Input contains bigint and a file
- **WHEN** the input is `{ id: 1n, file: <File 3 bytes> }`
- **THEN** the record's input is `{ id: "1n", file: "[File 3 bytes]" }`

#### Scenario: Input contains a Map and a Set
- **WHEN** the input is `{ m: new Map([["a", 1]]), s: new Set(["x"]) }`
- **THEN** the record's input is `{ m: [["a", 1]], s: ["x"] }`

## ADDED Requirements

### Requirement: Record aborted calls as cancelled
When a call fails, or its event iterator throws, after the call's abort signal has been aborted, the system SHALL record state `cancelled` and no error. Events received before the abort SHALL be kept. The error SHALL still reach the caller unchanged.

#### Scenario: Call aborted before the response
- **WHEN** the caller aborts the signal passed to a call while the request is in flight
- **THEN** the record's state is `cancelled`, it has no error, and the caller still receives the abort error

#### Scenario: Stream aborted after some events
- **WHEN** the caller aborts the signal of a streamed call after receiving two events
- **THEN** the record's state is `cancelled`, it has no error, and its events are the two received events

#### Scenario: Not counted as an error
- **WHEN** a query library cancels a query by aborting its signal
- **THEN** the record is not counted in the panel's Errors filter, in the dock badge, or in the copied error report

### Requirement: Mark stream reconnects
When a streamed call starts a new transport attempt after the stream began (for example a retry plugin reconnecting after an error), that attempt SHALL record the total number of events the call had received before it started. Attempts made before the stream began SHALL NOT have this number.

#### Scenario: Stream reconnects twice
- **WHEN** a stream yields 0 and 1 and fails, the retry plugin reconnects twice, and each attempt again yields 0 and 1
- **THEN** the record has three attempts, the second marks 2 events before it and the third marks 4, and the events are `[0, 1, 0, 1, 0, 1]`

#### Scenario: Plain retried call
- **WHEN** a call without a stream is retried after two 500 responses
- **THEN** none of its three attempts has an events-before number
