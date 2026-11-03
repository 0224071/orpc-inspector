/** Plugin added by `@vitejs/devtools@0.8.0`; its configureServer runs every plugin's `devtools.setup`, so the dock exists exactly when it is resolved */
export const DEVTOOLS_SERVER_PLUGIN = 'vite:devtools:server'

/** Same check as Vite 8.3.5 `isDevToolsOptionEnabled` */
export function isDevToolsOptionEnabled(option: unknown) {
  return option === true
    || (typeof option === 'object' && option !== null && (option as { enabled?: unknown }).enabled !== false)
}

/** Warning when the resolved plugins have no DevTools server; `enabled` is the user's `devtools` option */
export function devToolsMissingWarning(enabled: boolean) {
  return enabled
    ? '[orpc-inspector] Vite DevTools failed to load (see "Failed to load Vite DevTools integration" above), so the oRPC panel has no supported entry. The panel URL opened on its own stays disconnected.'
    : '[orpc-inspector] Vite DevTools is not enabled, so the oRPC panel has no supported entry. Set `devtools: true` in the Vite config and install `@vitejs/devtools`. The panel URL opened on its own stays disconnected.'
}

/** Startup line shared by Vite and Nuxt */
export function startupLine(panelUrl: string) {
  return `[orpc-inspector] Open the oRPC panel from the DevTools dock. Panel URL: ${panelUrl}`
}
