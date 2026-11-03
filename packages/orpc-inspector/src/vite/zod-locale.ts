import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { ISSUE_TRANSLATOR_KEY } from '../core/translate-issues'

const ZOD_LOCALE_NAME = /^[a-z]{2,3}(?:-[A-Za-z0-9]+)*$/
const ZOD_CORE = 'zod/v4/core'
const ZOD_EN = 'zod/v4/locales/en.js'

/** Nearest node_modules/zod above root; walked by hand because pnpm's bin shims set NODE_PATH to its hoisted store */
function findZod(root: string): string | undefined {
  for (let dir = root; ; dir = dirname(dir)) {
    const pkg = join(dir, 'node_modules', 'zod', 'package.json')
    if (existsSync(pkg))
      return pkg
    if (dirname(dir) === dir)
      return undefined
  }
}

/** Resolves the zod locale and core from the project root; returns the locale specifier, or why it cannot be used */
export function resolveZodLocale(zodLocale: string, root: string): { specifier: string } | { warning: string } {
  if (!ZOD_LOCALE_NAME.test(zodLocale))
    return { warning: `zodLocale "${zodLocale}" is not a valid locale name; issue messages are shown untranslated` }
  const specifier = `zod/v4/locales/${zodLocale}.js`
  const zod = findZod(root)
  try {
    if (!zod)
      throw new Error('zod not found')
    // Self-reference through zod's own exports
    const require = createRequire(zod)
    require.resolve(specifier)
    require.resolve(ZOD_CORE)
    require.resolve(ZOD_EN)
  }
  catch {
    return { warning: `zodLocale "${zodLocale}" cannot be resolved from ${root} (is zod 4 installed?); issue messages are shown untranslated` }
  }
  return { specifier }
}

/** Modules to pre-bundle alongside a resolved locale */
export function zodOptimizeDeps(specifier: string) {
  return [specifier, ZOD_CORE, ZOD_EN]
}

/** Source of the issue translator module; only reads zod's global config and never calls z.config() */
export function translatorModule(specifier: string) {
  return [
    `import locale from '${specifier}'`,
    `import english from '${ZOD_EN}'`,
    `import { globalConfig } from '${ZOD_CORE}'`,
    `globalThis[Symbol.for('${ISSUE_TRANSLATOR_KEY.description}')] = { target: locale().localeError, english: english().localeError, config: globalConfig }`,
  ].join('\n')
}
