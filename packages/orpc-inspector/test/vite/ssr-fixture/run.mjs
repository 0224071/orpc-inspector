// Runs in a plain `node` child process (no --conditions), like a user's server.js
// Usage: node run.mjs <scenario>; prints a JSON report
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const scenario = process.argv[2]
/** The v2 scenario loads the same app built on oRPC v2 and `orpc-inspector/v2` */
const entry = scenario === 'v2'
  ? '/entry-server-v2.ts'
  : '/entry-server.ts'

const userSsr = {
  'default': undefined,
  'v2': undefined,
  'no-plugin': undefined,
  'no-external-true': { noExternal: true },
  'no-external-regex': {
    noExternal: [/^@orpc\//],
  },
  'external-list': {
    external: ['orpc-inspector'],
  },
  'external-true': { external: true },
}[scenario]

async function main() {
  // The plugin from the installed copy's own dist, as an app would import it
  const { orpcInspector } = await import('orpc-inspector/vite')

  const server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    appType: 'custom',
    server: { middlewareMode: true, ws: false },
    plugins: scenario === 'no-plugin'
      ? []
      : [
          orpcInspector(),
        ],
    ssr: userSsr,
  })

  try {
    const render = async marker => (await server.ssrLoadModule(entry)).render(marker)
    const importer = fileURLToPath(new URL(`.${entry}`, import.meta.url))
    const report = {
      single: await render('a'),
      concurrent: await Promise.all([
        render('b'),
        render('c'),
      ]),
      externalConditions: server.environments.ssr.config.resolve.externalConditions,
      execArgv: process.execArgv,
      nodeOptions: process.env.NODE_OPTIONS ?? null,
      ssrClient: (await server.environments.ssr.pluginContainer.resolveId('orpc-inspector/client', importer))?.id,
      browserRoot: (await server.environments.client.pluginContainer.resolveId('orpc-inspector', importer))?.id,
    }
    server.moduleGraph.invalidateAll()
    report.afterInvalidate = await render('d')
    process.stdout.write(JSON.stringify(report))
  }
  finally {
    await server.close()
  }
}

void main()
