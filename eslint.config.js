// @ts-check
import { fileURLToPath } from 'node:url'
import antfu from '@antfu/eslint-config'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'

export default antfu({
  vue: true,
  typescript: true,
  ignores: [
    'openspec/**',
    'docs/**',
    '.tmp/**',
    '.claude/**',
    '.agents/**',
  ],
}, {
  // Tailwind classes in the panel: sort them and drop duplicates; all of these autofix
  // no-unknown-classes is off: the components keep semantic classes (`.item`, `.is-selected`) that tests and scoped styles rely on
  name: 'panel/tailwindcss',
  files: ['packages/orpc-inspector/panel/**/*.vue'],
  plugins: {
    'better-tailwindcss': betterTailwindcss,
  },
  settings: {
    'better-tailwindcss': {
      // tailwindcss is a dependency of the package, not of the repo root
      cwd: fileURLToPath(new URL('./packages/orpc-inspector', import.meta.url)),
      entryPoint: fileURLToPath(new URL('./packages/orpc-inspector/panel/panel.css', import.meta.url)),
    },
  },
  rules: {
    'better-tailwindcss/enforce-consistent-class-order': 'error',
    'better-tailwindcss/enforce-canonical-classes': 'error',
    'better-tailwindcss/no-duplicate-classes': 'error',
    'better-tailwindcss/no-unnecessary-whitespace': 'error',
    'better-tailwindcss/no-deprecated-classes': 'error',
    'better-tailwindcss/no-conflicting-classes': 'error',
  },
})
