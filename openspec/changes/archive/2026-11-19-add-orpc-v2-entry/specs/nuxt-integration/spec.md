# Spec Delta

## ADDED Requirements

### Requirement: Plugin for the installed oRPC major
`useOrpcInspectorPlugin()` SHALL return the oRPC v2 link plugin when the `@orpc/client` resolved from the project root is major 2, and the v1 link plugin otherwise, with the same server and client behavior for both. No module option is needed to choose.

#### Scenario: Nuxt project on oRPC v2
- **WHEN** a Nuxt project with `@orpc/client@2.0.0-beta.51` passes `useOrpcInspectorPlugin()` to an RPCLink's `plugins` and runs `nuxt dev`
- **THEN** the link is created without error, and client calls and SSR calls with side `ssr` are recorded

#### Scenario: Nuxt project on oRPC v1
- **WHEN** a Nuxt project with `@orpc/client@1.16` does the same
- **THEN** it gets the v1 link plugin, as before this change

### Requirement: Production no-op works with both oRPC majors
In builds without `production`, the link plugin returned by `useOrpcInspectorPlugin()` SHALL be accepted by both oRPC v1 and v2 links and SHALL leave the link's options as the user wrote them.

#### Scenario: nuxt build on oRPC v2
- **WHEN** a Nuxt project on oRPC v2 is built with `nuxt build` without `production` and a page creates an RPCLink with `useOrpcInspectorPlugin()`
- **THEN** the link is created without error and calls behave as without the inspector
