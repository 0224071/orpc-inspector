import { OrpcInspectorPlugin } from 'orpc-inspector'

// Keep the plugin in the bundle
;

(globalThis as { fixturePlugin?: unknown }).fixturePlugin = new OrpcInspectorPlugin()
