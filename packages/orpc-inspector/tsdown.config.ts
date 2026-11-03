import { defineConfig } from 'tsdown'

const neverBundle = [
  /^@orpc\//,
  'vite',
  'nuxt',
  /^nuxt\//,
  '@nuxt/kit',
  '@nuxt/schema',
  'vue',
  /^devframe(\/|$)/,
]

export default defineConfig([
  {
    entry: {
      'index': 'src/index.ts',
      'index.prod': 'src/index.prod.ts',
      'vite': 'src/vite/index.ts',
      'nuxt': 'src/nuxt/module.ts',
      'client': 'src/client/index.ts',
    },
    format: 'esm',
    platform: 'neutral',
    fixedExtension: false,
    dts: true,
    deps: {
      neverBundle,
    },
  },
  // Nuxt runtime plugins are compiled by the user's Nuxt, so emit them file by file; the core always goes through the package entry to share one instance with the app
  {
    entry: [
      'src/nuxt/runtime/*.ts',
      '!src/nuxt/runtime/*.d.ts',
    ],
    outDir: 'dist/runtime',
    unbundle: true,
    clean: false,
    format: 'esm',
    platform: 'neutral',
    fixedExtension: false,
    dts: true,
    deps: {
      neverBundle: [
        ...neverBundle,
        /^#/,
        /^orpc-inspector(\/|$)/,
        /^virtual:/,
      ],
    },
  },
])
