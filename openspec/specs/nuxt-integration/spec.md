# nuxt-integration Specification

## Purpose

Let Nuxt projects use orpc-inspector by adding a single module, with SSR calls automatically carried to the panel and no manual serialization.

## Requirements

### Requirement: One-line setup
After a Nuxt project adds `orpc-inspector/nuxt` to `modules`, the system SHALL provide the panel page and page script during `nuxt dev`, behaving as in `panel-hosting`. Unless `production` is `true` in the `orpcInspector` config key, the `nuxt build` output MUST be identical to that without the module.

#### Scenario: nuxt dev
- **WHEN** the project adds the module, attaches the devtools plugin to the link, runs `nuxt dev`, and uses Nuxt DevTools v4
- **THEN** the dock's oRPC item shows the panel, and client calls appear in it

#### Scenario: nuxt build
- **WHEN** `nuxt build` is run without `production`
- **THEN** the output contains no panel, page script or recording logic

### Requirement: SSR records carried to the client automatically
The Nuxt module SHALL provide a collector for every SSR request automatically, and carry it to the client via the Nuxt payload to merge into the store; users write the same link plugin setup on server and client, without calling any serialization API.

#### Scenario: SSR page
- **WHEN** a page calls `profile.get` during SSR and the browser finishes hydration
- **THEN** the panel shows one `profile.get` record with side `ssr`, with sensitive headers masked

### Requirement: Compatible with Nuxt DevTools versions
The module SHALL warn once when Nuxt DevTools is missing, disabled, or older than v4, and SHALL still start the dev server. When Nuxt uses Nuxt DevTools v4, which is built on Vite DevTools, the panel SHALL appear in the dock.

#### Scenario: Nuxt DevTools v3
- **WHEN** the project uses Nuxt DevTools v3, the default in nuxt 4.6
- **THEN** the dev server starts, logs one warning that v3 has no dock and the inspector is unsupported, and a top-level open of the panel URL stays disconnected

#### Scenario: Nuxt DevTools v4
- **WHEN** the project uses Nuxt DevTools v4 and opens the app
- **THEN** the dock shows an oRPC item and the panel lists client calls

#### Scenario: DevTools disabled
- **WHEN** Nuxt DevTools is disabled
- **THEN** the dev server starts and logs one warning that the inspector is unsupported without the dock

### Requirement: zodLocale module option
The Nuxt module SHALL accept `zodLocale` in its `orpcInspector` config key and apply issue translation during `nuxt dev` the same way as the Vite plugin, for both client records and SSR records carried in the payload. Unless `production` is `true`, the `nuxt build` output MUST stay identical to that without the module; with `production`, translation SHALL apply in the built app the same way as in dev.

#### Scenario: Nuxt with zodLocale
- **WHEN** `nuxt.config` sets `orpcInspector: { zodLocale: 'zh-TW' }` and a page's SSR call fails output validation with a default zod message
- **THEN** after hydration the panel shows that SSR record's issue in Traditional Chinese

#### Scenario: nuxt build with zodLocale
- **WHEN** `nuxt build` is run with `zodLocale` set and without `production`
- **THEN** the output contains no zod locale loaded by the inspector and no translation code

#### Scenario: Opted-in nuxt build with zodLocale
- **WHEN** `nuxt build` is run with `orpcInspector: { production: true, zodLocale: 'zh-TW' }` and a page's SSR call fails output validation with a default zod message in the deployed app
- **THEN** after hydration the panel shows that SSR record's issue in Traditional Chinese

### Requirement: Pre-bundle oRPC client imports
During `nuxt dev` the module SHALL append `@orpc/client`, `@orpc/client/fetch` and `@orpc/contract` (the oRPC modules the inspector imports at runtime) to Vite `optimizeDeps.include` when each id is not already listed. It MUST NOT remove or replace entries the project already set. It MUST NOT add an id that the project listed in `optimizeDeps.exclude`.

#### Scenario: Project already has include entries
- **WHEN** `nuxt dev` runs and `optimizeDeps.include` already lists another module
- **THEN** that module is still listed, and `@orpc/client`, `@orpc/client/fetch` and `@orpc/contract` are listed too

#### Scenario: Id already included
- **WHEN** `optimizeDeps.include` already lists `@orpc/client`
- **THEN** `@orpc/client` appears once, and `@orpc/client/fetch` and `@orpc/contract` are still appended

#### Scenario: Id excluded by the project
- **WHEN** `optimizeDeps.exclude` lists `@orpc/client/fetch`
- **THEN** `@orpc/client/fetch` is not added to `include`, the exclude entry stays, and `@orpc/client` and `@orpc/contract` are still appended

### Requirement: Nuxt production opt-in
The Nuxt module SHALL accept `production` in its `orpcInspector` config key, `false` by default. When it is `true` and `@vitejs/devtools` can be resolved from the project, the `nuxt build` output SHALL record client calls and SSR calls as during `nuxt dev`, carry SSR records to the client via the payload, serve the panel at `<app.baseURL>__orpc-inspector/`, and show an oRPC item in a Vite DevTools dock on app pages, without changes to app code.

#### Scenario: Deployed Nuxt preview
- **WHEN** a project with `orpcInspector: { production: true }` and `useOrpcInspectorPlugin()` on its link is built with `nuxt build` and the output is started
- **THEN** app pages show the Vite DevTools dock with an oRPC item, and the panel lists the page's client calls and its SSR calls with side `ssr`

#### Scenario: Sensitive headers in a deployed Nuxt app
- **WHEN** a client call and an SSR call in that deployed app send an `authorization` header
- **THEN** both records hold `***` for `authorization`, and the panel cannot reveal the original value

#### Scenario: app.baseURL set
- **WHEN** `app.baseURL` is `/app/` and the opted-in build is started
- **THEN** `/app/__orpc-inspector/` returns the panel HTML and all panel assets load

### Requirement: Nuxt production opt-in needs Vite DevTools
When `production` is `true` but `@vitejs/devtools` cannot be resolved from the project, the module SHALL log one warning and produce the same `nuxt build` output as without `production`.

#### Scenario: Vite DevTools not installed
- **WHEN** a project without `@vitejs/devtools` sets `orpcInspector: { production: true }` and runs `nuxt build`
- **THEN** the build succeeds, logs one `[orpc-inspector]` warning, and the output contains no panel, page script or recording logic
