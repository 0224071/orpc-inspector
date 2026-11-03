# panel-hosting Specification

## Purpose

Serve the DevTools panel on the Vite dev server and sync the page's call records to it; mount it in the Vite DevTools dock when available.

## Requirements

### Requirement: Active on the dev server by default
The Vite plugin SHALL accept a `production` option, `false` by default. With `production` unset or `false`, the plugin SHALL take effect only during `vite serve`, and the `vite build` output MUST be identical to that without the plugin.

#### Scenario: Production build
- **WHEN** a project with the plugin is built with `vite build`
- **THEN** the output contains no panel route, page script or dock registration

#### Scenario: Option explicitly off
- **WHEN** a project with `orpcInspector({ production: false })` is built with `vite build`
- **THEN** the output is identical to that of a build without the plugin

#### Scenario: SSR build with the option on
- **WHEN** a project with `orpcInspector({ production: true })` and Vite DevTools `build.withApp` runs its SSR server build
- **THEN** the server bundle contains the recorder but no page script, panel or dock registration

### Requirement: Serve the panel page
The dev server SHALL serve the panel page at `<base>__orpc-inspector/` using assets prebuilt in the package, without requiring the user's project to compile Vue SFCs or SCSS.

#### Scenario: Project sets base
- **WHEN** Vite `base` is `/app/` and the browser opens `/app/__orpc-inspector/`
- **THEN** the response is the panel HTML, and all panel assets load successfully

#### Scenario: Project does not have sass installed
- **WHEN** the user's project has neither sass nor a Vue SFC compiler installed
- **THEN** the panel still opens normally

### Requirement: Inject the page script
The dev server SHALL load the page script on app pages so the page's store is exposed to the panel; for Vite SPAs this is done by HTML injection, without changes to app code.

#### Scenario: Vite + Vue SPA
- **WHEN** the user adds the plugin to `vite.config` and attaches the devtools plugin to the link
- **THEN** after opening the app page the panel shows call records, and the app source does not import the page script

### Requirement: Page and panel communication
The page and panel SHALL communicate over an in-page channel, without going through the dev server and without authorization; the panel gets the full record list as read-only shared state and can call a "clear records" action.

#### Scenario: New call
- **WHEN** the panel is connected and the page makes a new call
- **THEN** the call appears in the panel list immediately, without reloading

#### Scenario: Panel opened after calls
- **WHEN** the panel is opened after the page already has 5 records
- **THEN** the panel shows these 5 records right after connecting

### Requirement: Register a Vite DevTools dock
When the project enables Vite DevTools, the plugin SHALL register an iframe dock with id `orpc-inspector` and title `oRPC` pointing to the panel page; it is registered only once per dev server. The DevTools dock SHALL be the only supported way to open the panel.

#### Scenario: Vite DevTools enabled
- **WHEN** the project enables Vite DevTools and opens the app
- **THEN** an oRPC item appears in the dock, and clicking it shows the panel

#### Scenario: Vite DevTools not enabled
- **WHEN** the project does not enable Vite DevTools
- **THEN** the dev server still starts, the plugin does not throw, and the log contains one warning that the inspector is unsupported without Vite DevTools

### Requirement: Dock error badge
When a dock is present, the system SHALL show on the dock button the total number of records with state `error` or `invalid` (danger style); no badge is shown when the count is 0. The badge keeps updating while the panel is closed.

#### Scenario: Errors occur
- **WHEN** the page makes 1 `error` call and then 1 `invalid` call
- **THEN** the dock badge shows `2`

#### Scenario: Clear records
- **WHEN** the user clears the records
- **THEN** the badge disappears

### Requirement: Page script translates before publishing
When the Vite plugin is given `zodLocale`, the page script SHALL apply issue translation (see `issue-translation`) to the records it publishes to the panel, so the panel receives the original and the translated message together. The page-side store SHALL keep the records as recorded.

#### Scenario: Panel receives a translated record
- **WHEN** `orpcInspector({ zodLocale: 'zh-TW' })` is used and a call fails validation with a default zod message
- **THEN** the record the panel receives has the original message and its Traditional Chinese translation

#### Scenario: Plugin without the option
- **WHEN** `orpcInspector()` is used
- **THEN** the page script does not load any zod module and publishes records as recorded

### Requirement: zodLocale leaves no build output
The `zodLocale` option SHALL have no effect on `vite build` output unless `production` is `true`, consistent with the plugin being active only on the dev server by default. When `production` is `true` and the build includes the inspector, the bundled page script SHALL apply issue translation the same way as on the dev server.

#### Scenario: Build with zodLocale
- **WHEN** a project with `orpcInspector({ zodLocale: 'zh-TW' })` is built with `vite build`
- **THEN** the output contains no zod locale loaded by the inspector and no translation code

#### Scenario: Production build with zodLocale
- **WHEN** a project with `orpcInspector({ production: true, zodLocale: 'zh-TW' })` and Vite DevTools `build.withApp` is built, and a call in the deployed app fails validation with a default zod message
- **THEN** the record the panel receives has the original message and its Traditional Chinese translation

### Requirement: Startup log names the dock and the panel URL
On dev server startup the system SHALL log one info line that tells the user to open the oRPC panel from the DevTools dock and includes the absolute panel URL. Vite and Nuxt SHALL use the same sentence. The URL SHALL be the origin the user opens, including the panel path. The system SHALL log that line once per server start and SHALL NOT log it on each request or during a production build.

#### Scenario: Vite dev server
- **WHEN** the user starts the Vite dev server with the plugin
- **THEN** the log contains one info line with the dock instruction and the panel URL on that server's origin

#### Scenario: Nuxt dev server
- **WHEN** the user starts `nuxt dev` with the module
- **THEN** the info line's URL uses the Nuxt server origin and the panel path under `app.baseURL`, and the log does not advertise a different port

#### Scenario: Production build
- **WHEN** the user runs `vite build` or `nuxt build`
- **THEN** the build log does not contain the startup info line

### Requirement: Production opt-in build output
When `production` is `true` and Vite DevTools builds with the app (`build.withApp`), the plugin SHALL take effect in `vite build` without changes to app code. The client output SHALL contain the bundled page script, the real recorder, the prebuilt panel under `<outDir>/__orpc-inspector/` (served at `<base>__orpc-inspector/`), and the oRPC iframe dock entry (id `orpc-inspector`, title `oRPC`) in the Vite DevTools static hub. The SSR server output SHALL contain the real recorder only.

#### Scenario: Deployed preview build
- **WHEN** a project with `orpcInspector({ production: true })`, Vite DevTools `build: { withApp: true, injection: true }` and the devtools plugin on its link is built and the output is served statically
- **THEN** the app page shows the Vite DevTools dock with an oRPC item, and the panel lists the calls the page makes

#### Scenario: Project sets base
- **WHEN** Vite `base` is `/app/` and the opted-in output is served under `/app/`
- **THEN** `/app/__orpc-inspector/` returns the panel HTML and all panel assets load

#### Scenario: App code unchanged
- **WHEN** the same app source, importing `OrpcInspectorPlugin` from `orpc-inspector`, is built once with `production: true` and once without
- **THEN** only the opted-in output records calls, and the other output contains no recorder, store or page script code

### Requirement: Production opt-in needs a Vite DevTools build
When `production` is `true` but the build has no Vite DevTools build step (`build.withApp` off or Vite DevTools not installed), the plugin SHALL log one warning and leave both the client and the SSR server output identical to a build without the plugin. When `build.withApp` is on but `build.injection` is off, the plugin SHALL build the output as in "Production opt-in build output" and log one warning that the dock is not injected into the app.

#### Scenario: No Vite DevTools
- **WHEN** a project without Vite DevTools uses `orpcInspector({ production: true })` and runs `vite build`
- **THEN** the build succeeds, logs one `[orpc-inspector]` warning, and the output contains no panel, page script or recorder code

#### Scenario: Injection off
- **WHEN** a project uses `orpcInspector({ production: true })` with Vite DevTools `build: { withApp: true }` and no `injection`
- **THEN** the build succeeds with the panel and page script in the output, and logs one `[orpc-inspector]` warning that the dock is not injected
