# ssr-transfer Specification

## Purpose

Make oRPC calls made during SSR visible in the browser's DevTools panel, without mixing records across concurrent requests and without exposing sensitive data in the HTML.

## Requirements

### Requirement: One collector per request
The server SHALL send each request's call records only to that request's collector, never to the global store.

#### Scenario: Two concurrent requests
- **WHEN** request A and request B make oRPC calls on the server at the same time
- **THEN** A's collector contains only A's calls, and B's collector only B's calls

#### Scenario: No collector
- **WHEN** a server call happens with no collector available
- **THEN** nothing is recorded, nothing is thrown, and the call completes normally

### Requirement: Collect only completed calls
The collector SHALL keep only completed (successful or failed) calls, with side marked `ssr`.

#### Scenario: Calls still in progress at serialization
- **WHEN** a call is not yet completed at the time of serialization
- **THEN** the output does not include it

### Requirement: Mask on the server at record time
Server records SHALL mask sensitive data when written to the collector: values of request / response headers whose names match the default sensitive pattern, and headers inside error data, are replaced with `***`.

#### Scenario: authorization header
- **WHEN** an SSR call's request headers include `authorization: Bearer abc`
- **THEN** that value is `***` in the serialized result, and the output does not contain `Bearer abc`

### Requirement: Serialization and injection
The collector SHALL provide a JSON-safe serialized result, and the system SHALL also provide a helper that produces a `<script>` snippet; the snippet MUST escape characters such as `</script>` and `<!--` so it cannot inject HTML.

#### Scenario: Data contains `</script>`
- **WHEN** an output string contains `</script><script>alert(1)</script>`
- **THEN** the snippet produced by the helper has only one script element, and the data restored after browser parsing equals the original

### Requirement: Merge on the client
The browser SHALL merge SSR records into the global store in their original order; each id appears only once, and repeated hydration does not create duplicates.

#### Scenario: Page load
- **WHEN** the page carries 2 SSR records, and 1 client call happens after hydration
- **THEN** the store is, in order, the client call, the 2nd SSR record, the 1st SSR record, with the SSR records' side `ssr`

#### Scenario: Repeated hydration
- **WHEN** the same batch of SSR records is hydrated twice
- **THEN** each id has only one record in the store

### Requirement: SSR payload carries issue parameters only
Serialized SSR records SHALL include the issue parameters kept by recording, and SHALL NOT include translated messages; translation happens in the browser after hydration.

#### Scenario: SSR validation failure with zodLocale
- **WHEN** `zodLocale` is `zh-TW` and an SSR call fails a zod `z.string().min(3)` check
- **THEN** the serialized record's issue has code, path, message, origin, minimum and inclusive, and no translated message

### Requirement: Vite dev server SSR entry needs no conditions
On the Vite dev server, a server module loaded through Vite's `ssr` environment that imports `orpc-inspector` SHALL get the real recorder, including when the package is installed as an external dependency, without the user setting resolve conditions, Node `--conditions` or `NODE_OPTIONS`. The resolve conditions used for other packages SHALL stay unchanged. Only the exact root specifier is affected.

#### Scenario: Installed package loaded with ssrLoadModule
- **WHEN** an app installs `orpc-inspector` in `node_modules`, adds the Vite plugin, keeps Vite's default `ssr.resolve.externalConditions`, runs Node without development flags, and loads an SSR entry that records into a collector with `vite.ssrLoadModule()`
- **THEN** the rendered head carries that request's SSR records, sensitive headers are `***`, and the resolved `externalConditions` are still Vite's defaults

#### Scenario: Concurrent requests through the dev server
- **WHEN** two requests render through that SSR entry at the same time, each with its own collector
- **THEN** each head contains only its own request's call

#### Scenario: Subpaths and the browser
- **WHEN** the same dev server resolves `orpc-inspector/client` for SSR, or `orpc-inspector` for the browser
- **THEN** they resolve the same files as without this requirement

#### Scenario: User keeps the package external
- **WHEN** the user's config lists `orpc-inspector` in `ssr.external`, or sets `ssr.external: true`
- **THEN** the import stays external and resolves with the user's conditions, as without the plugin

#### Scenario: Reload after invalidation
- **WHEN** the dev server's module graph is invalidated and the SSR entry is loaded again
- **THEN** the next render still records with the real recorder

### Requirement: Plain Node servers outside Vite
A server that imports `orpc-inspector` natively, not through Vite's module graph, SHALL keep resolving the package by Node's own conditions: the no-op by default, the real recorder with `--conditions=development`.

#### Scenario: Native import without the flag
- **WHEN** a Node process without `--conditions=development` imports `orpc-inspector` directly and renders with a collector
- **THEN** the rendered head is empty
