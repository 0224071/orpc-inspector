# Spec Delta

## ADDED Requirements

### Requirement: Transport attempts in details
When the selected call made more than one transport attempt, the details SHALL list every attempt in order with its number, method, status (or "no response" when the transport failed) and URL. A call with one attempt or none SHALL show no attempt list.

#### Scenario: Retried call
- **WHEN** a call whose attempts returned 503, 503 and 200 is selected
- **THEN** the details list attempts 1, 2 and 3 with statuses 503, 503 and 200, and the summary status is 200

#### Scenario: Transport failure
- **WHEN** a call whose first attempt got no response and whose second returned 200 is selected
- **THEN** the first attempt shows "no response"

#### Scenario: Single attempt
- **WHEN** a call with one attempt is selected
- **THEN** no attempt list is shown

### Requirement: Stream events in details
For a call that returned an event iterator, the details SHALL list its recorded events in order as JSON trees, each labeled with its position in the whole stream, and SHALL show the total event count, noting when only the last events were kept. The body SHALL be shown only when it has a value (for example error data).

#### Scenario: Stream failed after two events
- **WHEN** a stream that yielded two events and then failed is selected
- **THEN** the details show the error, and the events list shows both events labeled 1 and 2

#### Scenario: Events over the limit
- **WHEN** a stream with 150 events, of which the last 100 were kept, is selected
- **THEN** the events list shows the count 150, notes that only the last 100 are shown, and labels the first shown event 51

#### Scenario: Stream without events
- **WHEN** a stream that ended without events is selected
- **THEN** the events list says there are no events and no empty body is shown

### Requirement: Stream reconnects in details
When an attempt of the selected stream marks how many events came before it, the events list SHALL show a divider naming that attempt before the first event it delivered.

#### Scenario: Reconnected stream
- **WHEN** a stream whose second attempt marks 2 events before it is selected
- **THEN** a divider for attempt 2 appears between the second and the third event

### Requirement: Attempts and events in copied reports
A copied report SHALL include an attempts line with the attempt count and each attempt's status when a call made more than one attempt, as part of the request fields. For a streamed call, the response part SHALL include its events, grouped by attempt when the stream reconnected, with the same masking and trimming as other JSON. Both follow the existing section toggles; templates gain no setting.

#### Scenario: Copy a retried call
- **WHEN** a call whose attempts returned 503, 503 and 500 is copied with the Request section on
- **THEN** the report contains an attempts line `3 (503 → 503 → 500)`

#### Scenario: Copy a stream that failed
- **WHEN** a stream that yielded `{ token: "a" }` and `{ n: 1 }` and then failed is copied with the built-in Markdown template
- **THEN** the report contains both events, with `token` masked as `***`

#### Scenario: Response section off
- **WHEN** the same stream is copied with the Response section turned off
- **THEN** the report contains no events
