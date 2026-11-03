# call-recording Specification

## Purpose

Record the request, response and error details of every oRPC client call for the DevTools panel to inspect. Recording itself must not change call behavior and must leave no effect in production.

## Requirements

### Requirement: Record calls via link plugin
After the user adds the devtools plugin to an oRPC v1 link (RPCLink, OpenAPILink and other StandardLink subclasses), the system SHALL create a record for every call, containing id, procedure path (joined with `.`), side (`client` or `ssr`), state, start time, duration, input and result.

#### Scenario: Successful call
- **WHEN** `profile.get` is called through a link with the devtools plugin and returns successfully
- **THEN** the record has procedure `profile.get`, state `success`, output set to the returned value, and a non-negative duration

#### Scenario: Call in progress
- **WHEN** a call has been sent but not yet completed
- **THEN** the record already exists with state `pending`, and on completion the record with the same id is updated to the final state

### Requirement: Always wrap validation plugins
Regardless of the devtools plugin's position in the `plugins` array, the system SHALL place the recording logic outside RequestValidationPlugin and ResponseValidationPlugin so it receives the validation errors they throw.

#### Scenario: devtools plugin before or after the validation plugin
- **WHEN** `plugins` is `[devtools, ResponseValidationPlugin]` or `[ResponseValidationPlugin, devtools]`, and the backend returns data that does not match the output schema
- **THEN** both orders produce a record with state `invalid` and issuesOf `output`

### Requirement: Error classification
The system SHALL classify failed calls into four kinds: output validation failure (`invalid` / `output`), input validation failure detected on the client (`invalid` / `input`), input validation failure reported by the server (`invalid` / `input` with issues source `server`), and other errors (`error`), recording the error's name and message, plus code, status and data for oRPC errors. Records without an issues source SHALL be treated as client validation failures.

#### Scenario: Response does not match output schema
- **WHEN** ResponseValidationPlugin throws a validation error because the response does not match the schema
- **THEN** the record has state `invalid` and issuesOf `output`, issues contain each problem's path and message, and output is the raw data that failed validation

#### Scenario: Input does not match schema
- **WHEN** RequestValidationPlugin refuses to send because the input does not match the schema
- **THEN** the record has state `invalid` and issuesOf `input`, and issues contain each problem's path and message

#### Scenario: Server rejects the input
- **WHEN** the server's input schema `z.object({ name: z.string().min(2) })` rejects `{ name: "A" }` and the client receives oRPC's `BAD_REQUEST` error with status 400 and `data.issues`
- **THEN** the record has state `invalid`, issuesOf `input` and issues source `server`, its issues contain path `["name"]`, code `too_small` and the server's message, and the record keeps status 400 and the error's code, status and data

#### Scenario: Backend returns 4xx
- **WHEN** the backend returns an oRPC error (e.g. status 404, code `NOT_FOUND`)
- **THEN** the record has state `error`, and error contains code, status and data

### Requirement: Record transport details
The system SHALL record in each record the HTTP method, full URL, request headers encoded by oRPC, response status and response headers; headers whose value is undefined are not recorded.

#### Scenario: GET call
- **WHEN** a call sent with GET completes
- **THEN** the record contains method `GET`, a url including the query, status and response headers

#### Scenario: Request not sent
- **WHEN** input validation fails and the request is not sent
- **THEN** the record has no method, url or status fields, attempts is empty, and the error classification is still present

#### Scenario: Retry
- **WHEN** the link has ClientRetryPlugin, and the call returns 500 twice then 200 on the third attempt
- **THEN** there is only one record, attempts has three entries in order (status 500, 500, 200), and the record's top-level status is 200

#### Scenario: Multiple calls share one context object
- **WHEN** the user issues two concurrent calls with the same context object
- **THEN** each record has only its own single attempt, with no mix-up

#### Scenario: Inner interceptor replaces the context
- **WHEN** an interceptor inside the recorder passes down `next({ context: newObject })`
- **THEN** the record still gets that call's method, url and status

### Requirement: Record streaming output
When a procedure returns an event iterator, the system SHALL update the record as the caller consumes it: `streaming` while consuming, received events recorded in order (each record keeps only the last 100 events and records the total event count), `success` on normal completion, `error` on failure, and `cancelled` when the consumer stops early. The wrapping SHALL NOT change iterator behavior, and on early stop the upstream iterator also receives `return()`.

#### Scenario: Fully consumed
- **WHEN** the procedure yields 1, 2, 3 and ends, and the caller reads all of them with `for await`
- **THEN** the record's events are `[1, 2, 3]` and state is `success`

#### Scenario: Early stop
- **WHEN** the caller `break`s after the first event
- **THEN** the record's state is `cancelled`, and the upstream iterator's `return()` is called

#### Scenario: Events exceed the limit
- **WHEN** the procedure yields 150 events and the caller reads all of them
- **THEN** the record's events are the last 100 events, and the total event count is 150

### Requirement: Do not change call behavior
Recording SHALL NOT change the call result: on success it returns the original value, on failure it rethrows the same error object.

#### Scenario: Error rethrown as is
- **WHEN** the call throws error E
- **THEN** the caller catches E itself

### Requirement: Records are serializable
The system SHALL ensure records can be structured-cloned and JSON-serialized: bigint becomes a `"<number>n"` string, Blob / File becomes `[<class> <size> bytes]`, and values that cannot be serialized become strings.

#### Scenario: Input contains bigint and a file
- **WHEN** the input is `{ id: 1n, file: <File 3 bytes> }`
- **THEN** the record's input is `{ id: "1n", file: "[File 3 bytes]" }`

### Requirement: Browser record storage
The browser SHALL keep records in a single global store: newest first, at most 300, dropping the oldest when exceeded; multiple clients on the same page, or the module loaded multiple times, share this store.

#### Scenario: Over the limit
- **WHEN** a new call happens after 300 records already exist
- **THEN** the store still has 300 records, the oldest is removed, and the new call is first

### Requirement: Recording without a link
The system SHALL also provide an interceptors API that produces the same records as the link plugin, so users can attach it where the plugin cannot be applied.

#### Scenario: Attaching interceptors manually
- **WHEN** the user puts the interceptors first in the link's `interceptors` and `clientInterceptors`
- **THEN** the produced records have the same fields as with the link plugin

### Requirement: No-op in production
Under non-development resolve conditions (e.g. a production build), the system SHALL by default provide a no-op implementation with the same API: the plugin and interceptors record nothing, and the recording logic is not bundled into the output. Only when the `production` option of the Vite plugin or the Nuxt module includes the inspector in a build SHALL that build use the real recorder, in both the browser and the server output.

#### Scenario: Production build
- **WHEN** the user builds an app that uses the devtools plugin with `vite build`
- **THEN** the output contains no error classification, store or page script code, and calls behave the same as without devtools

#### Scenario: Opted-in production build
- **WHEN** the user builds the same app with `orpcInspector({ production: true })` and Vite DevTools `build.withApp`
- **THEN** the client output and the SSR server output record calls with the devtools plugin, and calls still return the same results and throw the same errors as without devtools

### Requirement: Real recorder in Vite dev server SSR
The SSR entry loaded through the Vite dev server is development by definition and SHALL use the real recorder regardless of its resolve conditions (see ssr-transfer). Builds SHALL keep the no-op unless `production` is set.

#### Scenario: Vite dev server SSR does not affect builds
- **WHEN** the user runs the SSR server build of the same app with `vite build --ssr` and without `production`
- **THEN** the server output renders an empty head, as before the dev server took over the SSR entry

### Requirement: Keep issue parameters
For each validation issue, the system SHALL record, in addition to path, message and code, the following issue parameters when present with a serializable value: `expected`, `minimum`, `maximum`, `origin`, `format`, `values`, `keys`, `divisor`, `inclusive`, `exact`, `prefix`, `suffix`, `includes`, `pattern`. Other issue fields SHALL NOT be recorded. Records without these parameters (from earlier versions or other schema libraries) SHALL remain valid.

#### Scenario: Too short string
- **WHEN** output validation fails a zod `z.string().min(3)` check
- **THEN** the issue has code `too_small`, origin `string`, minimum `3` and inclusive `true`, alongside path and message

#### Scenario: Enum mismatch
- **WHEN** output validation fails a zod `z.enum(['a', 'b'])`
- **THEN** the issue has code `invalid_value` and values `["a", "b"]`

#### Scenario: Regex check
- **WHEN** input validation fails a zod `z.string().regex(/^\d+$/)` check
- **THEN** the issue has format `regex` and pattern as a string

#### Scenario: Issue without parameters
- **WHEN** a non-zod schema reports an issue with only path and message
- **THEN** the issue has path and message, and no parameter fields

#### Scenario: Bigint bound
- **WHEN** a zod bigint check reports minimum `10n`
- **THEN** the recorded minimum is the serializable string `"10n"`

### Requirement: Recognize server input validation errors
The system SHALL treat an oRPC `BAD_REQUEST` error without a client validation cause as a server input validation failure when `data.issues` is a non-empty list of Standard Schema issues (each with a string `message` and a `path` list), recording code and parameters under the same rules as client issues. Any other error SHALL be recorded as state `error` with its data unchanged.

#### Scenario: Issue parameters from the server
- **WHEN** the server rejects input with zod issues for `z.email()`, `z.enum(['a', 'b'])` and `z.bigint().min(10n)`
- **THEN** the recorded issues keep format `email` and pattern as a string, values `["a", "b"]`, and minimum `"10n"`, alongside path, message and code

#### Scenario: Path segments as objects
- **WHEN** an issue's path arrives as `[{ "key": "items" }, { "key": 0 }, "sku"]`
- **THEN** the recorded path is `["items", 0, "sku"]`

#### Scenario: Custom check message from the server
- **WHEN** the server schema is `z.string().min(3, 'custom msg')` and rejects the input
- **THEN** the recorded issue has message `custom msg`, code `too_small` and minimum `3`

#### Scenario: Message rewritten by the app
- **WHEN** the app rethrows the validation error as `BAD_REQUEST` with message `Please check the form` and keeps `data.issues`
- **THEN** the record is a server input validation failure with those issues

#### Scenario: Issues in another shape
- **WHEN** the server returns `BAD_REQUEST` with `data.issues` equal to `["name is required"]`
- **THEN** the record has state `error` and no issues, and error data still contains that list

#### Scenario: Other error codes
- **WHEN** the server returns `CONFLICT` with `data.issues` shaped like validation issues
- **THEN** the record has state `error` and no issues

#### Scenario: Server output validation failure
- **WHEN** the server's output schema rejects the handler's result and the client receives `INTERNAL_SERVER_ERROR` `Output validation failed`
- **THEN** the record has state `error`, as before this change

### Requirement: Mask client records in opted-in builds
In a client build that includes the inspector through the `production` option, the system SHALL mask client records at record time the same way as server records: values of request / response headers whose names match the default sensitive pattern, and headers inside error data, are replaced with `***`. Client records on the dev server SHALL keep their values as today.

#### Scenario: Authorization header in a deployed build
- **WHEN** a call in an opted-in production build sends an `authorization` header
- **THEN** the record's request headers hold `***` for `authorization`, and the panel cannot reveal the original value

#### Scenario: Dev server unchanged
- **WHEN** the same call is made on the dev server
- **THEN** the record keeps the original `authorization` value, and the panel masks it on display as before

### Requirement: No reveal for values masked at record time
The panel SHALL show a header value that is `***` at record time as masked text with no reveal control, for client and SSR records alike. Header values masked only on display SHALL stay revealable as today.

#### Scenario: Masked client record in the panel
- **WHEN** the user opens the request headers of a client record from an opted-in production build whose `authorization` was recorded as `***`
- **THEN** `authorization` shows `***` with no reveal control

#### Scenario: Dev client record in the panel
- **WHEN** the user opens the request headers of a dev server client record with an `authorization` value
- **THEN** `authorization` shows `***` with a reveal control that shows the original value

### Requirement: SSR records in opted-in builds
In an opted-in build with SSR, the server SHALL record calls into the per-request collector and carry them to the browser the same way as on the dev server (see `ssr-transfer`), so the panel shows SSR records next to client records. Server records SHALL keep their record-time masking.

#### Scenario: Vite SSR app in an opted-in build
- **WHEN** a Vite SSR app built with `orpcInspector({ production: true })` and Vite DevTools `build.withApp` renders a page that makes one `profile.get` call on the server and writes `renderOrpcInspectorScript(collector)` into the HTML
- **THEN** after the page loads, the panel shows one `profile.get` record with side `ssr`, with sensitive headers masked
