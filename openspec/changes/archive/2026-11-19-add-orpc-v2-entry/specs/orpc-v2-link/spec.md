# Spec Delta

## Purpose

Record calls made through oRPC v2 links via a separate `orpc-inspector/v2` entry, producing the same records as for oRPC 1.x links, while the root entry keeps supporting oRPC 1.x.

## ADDED Requirements

### Requirement: Separate entry per oRPC major
The package SHALL provide `orpc-inspector/v2` for oRPC v2 links next to the root entry `orpc-inspector`, which SHALL stay the oRPC 1.x entry with an unchanged API. The v2 entry SHALL also export the major-independent API of the root entry (collector, collector resolver, SSR render and hydrate functions, record types).

#### Scenario: v2 link with the v2 plugin
- **WHEN** a project with `@orpc/client@2.0.0-beta.51` builds `new RPCLink({ plugins: [new OrpcInspectorPlugin()] })` with the plugin imported from `orpc-inspector/v2`
- **THEN** the link is created without error, and calls through it are recorded

#### Scenario: v1 link unchanged
- **WHEN** a project with `@orpc/client@1.16` imports `OrpcInspectorPlugin` from `orpc-inspector`
- **THEN** the plugin behaves as before this change

#### Scenario: SSR helpers from the v2 entry
- **WHEN** a v2 project imports `OrpcInspectorCollector` and `renderOrpcInspectorScript` from `orpc-inspector/v2`
- **THEN** they behave the same as the ones exported by `orpc-inspector`

### Requirement: Peer ranges accept both majors
The package SHALL declare peer ranges for `@orpc/client` and `@orpc/contract` that accept oRPC 1.16 and later 1.x releases, and oRPC 2 from `2.0.0-beta.51` on.

#### Scenario: Installing next to oRPC v2 beta
- **WHEN** a project with `@orpc/client@2.0.0-beta.51` and `@orpc/contract@2.0.0-beta.51` installs `orpc-inspector` with strict peer dependencies
- **THEN** the install reports no peer dependency conflict for oRPC

### Requirement: Records match the v1 records
Through a v2 link with the v2 plugin, the system SHALL produce one record per call with the same fields and states as the `call-recording` capability defines for v1 links: success, pending, streaming, cancelled, error, and invalid with client or server issues. Recording SHALL NOT change the call's result or the error object it throws.

#### Scenario: Successful call
- **WHEN** `ping` is called through a v2 RPCLink with the v2 plugin and returns `{ n: 1 }`
- **THEN** one record exists with procedure `ping`, state `success`, output `{ n: 1 }` and status 200

#### Scenario: Streaming output
- **WHEN** a v2 procedure yields 1, 2, 3 and the caller reads all of them
- **THEN** the record's events are `[1, 2, 3]` and its state is `success`

#### Scenario: Server rejects the input
- **WHEN** the v2 server's input schema rejects the input and the client receives `BAD_REQUEST` with `data.issues`
- **THEN** the record has state `invalid`, issuesOf `input`, issues source `server`, and status 400

### Requirement: Plugin wraps oRPC's built-in link plugins
The v2 plugin SHALL place its recording outside every oRPC v2 built-in link plugin (validation, retry, timeout, dedupe, batch, compression, cookie jar) regardless of its position in `plugins`. Relative to other plugins it SHALL keep its array position, so placing it last wraps them too.

#### Scenario: Plugin before the response validation plugin
- **WHEN** `plugins` is `[inspector, ResponseValidationLinkPlugin]` or `[ResponseValidationLinkPlugin, inspector]` and the backend returns data that does not match the output schema
- **THEN** both orders produce a record with state `invalid` and issuesOf `output`

#### Scenario: Retry
- **WHEN** the link has the v2 retry plugin listed after the inspector, and the call returns 500 twice then 200
- **THEN** there is one record whose attempts have status 500, 500, 200 in order

### Requirement: Plugin does not mutate link options
The v2 plugin SHALL leave the options object the user passes to the link unchanged, so building several links from one options object records each call once.

#### Scenario: Two links from one options object
- **WHEN** the user builds two RPCLinks from the same options object containing one v2 plugin, and makes one call through each
- **THEN** there are exactly two records, and the options object's `interceptors` and `transportInterceptors` are as the user wrote them

### Requirement: Manual interceptors for v2 links
The v2 entry SHALL provide interceptors for the link's `interceptors` and `transportInterceptors` that, put first in those arrays, produce the same records as the v2 plugin.

#### Scenario: Attaching interceptors manually
- **WHEN** the user puts the v2 interceptors first in a v2 link's `interceptors` and `transportInterceptors`
- **THEN** the records have the same fields as with the v2 plugin

### Requirement: HTTP status on v2 errors
For an oRPC v2 error decoded from an HTTP response, the system SHALL record the response status as the error's status, since v2 errors carry no status of their own.

#### Scenario: Backend returns 403
- **WHEN** a v2 procedure throws `ORPCError('FORBIDDEN')` and the client receives it over HTTP
- **THEN** the record has state `error`, and its error has code `FORBIDDEN` and status 403

#### Scenario: Error not from a response
- **WHEN** the v2 client's request validation plugin rejects the input before sending
- **THEN** the record's error has code `BAD_REQUEST` and no status

### Requirement: Non-oRPC error responses on v2
When a v2 link rejects a response that is not in oRPC's format, the system SHALL record state `error` with the error's name and message, the response status as its status, and the response status, headers and body as its data, masking headers under the same rules as error data on v1. A body oRPC left unread SHALL be recorded as a placeholder without reading it.

#### Scenario: Gateway answers with JSON
- **WHEN** a gateway in front of the v2 server answers 502 with the JSON body `{ "message": "Bad gateway" }`
- **THEN** the record has state `error`, error name `MalformedResponseError`, error status 502, and error data containing status 502 and that body

#### Scenario: Gateway answers with HTML
- **WHEN** the gateway answers 502 with an HTML body that oRPC does not read
- **THEN** the error data's body is the placeholder `[ReadableStream]`, and the stream on the thrown error is still unread

### Requirement: Request URL on v2 links
For v2 links the system SHALL record as url the request URL that oRPC v2 passes to transport interceptors, which can be a path without origin. The rest of the transport details SHALL follow the `call-recording` capability.

#### Scenario: GET call with query
- **WHEN** a v2 RPCLink configured with method GET calls `find` with `{ q: 'x' }`
- **THEN** the record has method `GET` and a url whose path ends with `/find` and that contains the encoded input in its query

### Requirement: No-op v2 entry in production
Under non-development resolve conditions the v2 entry SHALL resolve to a no-op with the same API, following the same rules as the root entry: the plugin returns the link options unchanged, interceptors call `next` as-is, and the recording code is not bundled. Where the Vite plugin or Nuxt module gives the root entry the real recorder (production opt-in builds, Vite dev server SSR), the v2 entry SHALL get the real recorder as well.

#### Scenario: Production build of a v2 app
- **WHEN** a v2 app that uses the plugin from `orpc-inspector/v2` is built with `vite build` without `production`
- **THEN** the link works, calls behave as without the inspector, and the output contains no recording code

#### Scenario: Opted-in production build of a v2 app
- **WHEN** the same app is built with `orpcInspector({ production: true })` and Vite DevTools `build.withApp`
- **THEN** client calls made through the v2 plugin are recorded
