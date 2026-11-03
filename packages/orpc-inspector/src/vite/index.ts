import type { OrpcInspectorVitePlugin } from './plugin'
import { createOrpcInspectorPlugin } from './plugin'

export type { OrpcInspectorVitePlugin } from './plugin'

export interface OrpcInspectorOptions {
  /**
   * zod locale (e.g. `'zh-TW'`) used to translate zod's default issue messages shown in the panel.
   * Loaded from the project's own zod; the app's zod config is never changed. Without zod 4 or an unknown locale, messages stay untranslated.
   */
  zodLocale?: string
  /**
   * Also include the inspector in `vite build` (for preview or staging deploys). Off by default: production builds contain no inspector code.
   * Needs Vite DevTools with `build.withApp` (and `build.injection` for the dock). Anyone who can load the built app can read the recorded calls; see README "Production builds".
   */
  production?: boolean
}

/** Vite plugin: injects the page script into the dev server, serves the `<base>__orpc-inspector/` panel page and registers the Vite DevTools dock; with `production`, also into `vite build` */
export function orpcInspector(options: OrpcInspectorOptions = {}): OrpcInspectorVitePlugin {
  return createOrpcInspectorPlugin({ zodLocale: options.zodLocale, production: options.production })
}
