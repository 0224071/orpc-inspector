# Spec Delta

## MODIFIED Requirements

### Requirement: Vite dev server SSR entry needs no conditions
On the Vite dev server, a server module loaded through Vite's `ssr` environment that imports `orpc-inspector` or `orpc-inspector/v2` SHALL get the real recorder, including when the package is installed as an external dependency, without the user setting resolve conditions, Node `--conditions` or `NODE_OPTIONS`. The resolve conditions used for other packages SHALL stay unchanged. Only these two exact specifiers are affected.

#### Scenario: Installed package loaded with ssrLoadModule
- **WHEN** an app installs `orpc-inspector` in `node_modules`, adds the Vite plugin, keeps Vite's default `ssr.resolve.externalConditions`, runs Node without development flags, and loads an SSR entry that records into a collector with `vite.ssrLoadModule()`
- **THEN** the rendered head carries that request's SSR records, sensitive headers are `***`, and the resolved `externalConditions` are still Vite's defaults

#### Scenario: v2 entry loaded with ssrLoadModule
- **WHEN** the same SSR entry imports the plugin and collector from `orpc-inspector/v2` instead
- **THEN** the dev server resolves it to the real v2 recorder, not the no-op

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
