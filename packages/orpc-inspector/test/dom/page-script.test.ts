import type { IssueTranslator } from '../../src/core/translate-issues'
import type { OrpcCall, OrpcInspectorProtocol } from '../../src/core/types'
import { connectPanelChannel } from 'devframe/in-page-channel'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toBadge } from '../../src/client/dock-badge'
import { getOrpcInspectorStore } from '../../src/core/store'
import { ISSUE_TRANSLATOR_KEY } from '../../src/core/translate-issues'
import { ORPC_INSPECTOR_CHANNEL, ORPC_INSPECTOR_SSR_GLOBAL } from '../../src/core/types'

const STARTED_KEY = Symbol.for('orpc-inspector:page-script')

function makeCall(id: string, patch: Partial<OrpcCall> = {}): OrpcCall {
  return {
    id,
    procedure: 'profile.get',
    side: 'client',
    state: 'success',
    startedAt: 0,
    ...patch,
  }
}

/** Starts the page script and connects a panel side via MessageChannel */
async function startWithPanel() {
  const { startPageScript } = await import('../../src/client/page-script')
  const page = startPageScript()
  const { port1, port2 } = new MessageChannel()
  page.addPanelPort(port1)
  const panel = connectPanelChannel<OrpcInspectorProtocol>({
    name: ORPC_INSPECTOR_CHANNEL,
    functions: {},
    window: false,
    transport: port2,
  })
  await panel.whenConnected(2000)
  const state = await panel.sharedState.get('calls')
  return { page, panel, state }
}

const g = globalThis as Record<PropertyKey, unknown>

beforeEach(() => {
  getOrpcInspectorStore().clear()
})

afterEach(() => {
  ;(g[STARTED_KEY] as { close: () => void } | undefined)?.close()
  delete g[STARTED_KEY]
  delete g[ORPC_INSPECTOR_SSR_GLOBAL]
  delete g[ISSUE_TRANSLATOR_KEY]
})

describe('page script', () => {
  it('delivers existing records immediately when the panel connects after calls', async () => {
    const store = getOrpcInspectorStore()
    for (const id of ['1', '2', '3', '4', '5'])
      store.upsert(makeCall(id))

    const { panel, state } = await startWithPanel()
    expect(state.value().list.map(call => call.id)).toEqual(['5', '4', '3', '2', '1'])
    panel.close()
  })

  it('syncs store changes to sharedState', async () => {
    const { panel, state } = await startWithPanel()
    const store = getOrpcInspectorStore()

    store.upsert(makeCall('a', { state: 'pending' }))
    await vi.waitFor(() => expect(state.value().list).toHaveLength(1))

    store.upsert(makeCall('a', { state: 'error' }))
    await vi.waitFor(() => expect(state.value().list[0]?.state).toBe('error'))
    // Store records are not frozen by shared state
    expect(Object.isFrozen(store.list[0])).toBe(false)
    panel.close()
  })

  it('clears the store when the panel calls calls:clear', async () => {
    const store = getOrpcInspectorStore()
    store.upsert(makeCall('a'))
    const { panel, state } = await startWithPanel()

    await panel.call('calls:clear')
    expect(store.list).toEqual([])
    await vi.waitFor(() => expect(state.value().list).toEqual([]))
    panel.close()
  })

  it('hydrates window.__ORPC_INSPECTOR_SSR__ on start', async () => {
    g[ORPC_INSPECTOR_SSR_GLOBAL] = [
      makeCall('s1', { side: 'ssr' }),
      makeCall('s2', { side: 'ssr' }),
    ]
    const { panel, state } = await startWithPanel()
    expect(state.value().list.map(call => call.id)).toEqual(['s2', 's1'])
    panel.close()
  })

  it('returns the same channel when started again', async () => {
    const { startPageScript } = await import('../../src/client/page-script')
    expect(startPageScript()).toBe(startPageScript())
  })
})

describe('page script issue translation', () => {
  const invalidCall = () => makeCall('v', {
    state: 'invalid',
    issuesOf: 'output',
    output: { name: 1 },
    issues: [
      {
        path: ['name'],
        message: 'Invalid input',
        code: 'invalid_type',
        expected: 'string',
      },
    ],
  })

  it('publishes translated copies and leaves the store untouched', async () => {
    const translator: IssueTranslator = {
      target: issue => `無效：${String(issue.expected)}`,
      config: {},
    }
    g[ISSUE_TRANSLATOR_KEY] = translator
    const store = getOrpcInspectorStore()
    store.upsert(invalidCall())

    const { panel, state } = await startWithPanel()
    expect(state.value().list[0]?.issues?.[0]).toMatchObject({ message: 'Invalid input', translatedMessage: '無效：string' })
    expect(store.list[0]?.issues?.[0]).not.toHaveProperty('translatedMessage')

    store.upsert(makeCall('w', {
      state: 'invalid',
      issuesOf: 'output',
      issues: [
        { path: [], message: 'Custom', code: 'custom' },
      ],
    }))
    await vi.waitFor(() => expect(state.value().list).toHaveLength(2))
    expect(state.value().list[0]?.issues?.[0]).not.toHaveProperty('translatedMessage')
    expect(state.value().list[1]?.issues?.[0]?.translatedMessage).toBe('無效：string')
    panel.close()
  })

  it('translates hydrated SSR records before the app loads zod', async () => {
    // The translator module runs before the app's `import 'zod'`, so localeError is still unset at start
    const config: IssueTranslator['config'] = {}
    g[ISSUE_TRANSLATOR_KEY] = {
      target: issue => `無效：${String(issue.expected)}`,
      english: issue => `Invalid input: expected ${String(issue.expected)}`,
      config,
    } satisfies IssueTranslator
    g[ORPC_INSPECTOR_SSR_GLOBAL] = [
      makeCall('s1', {
        side: 'ssr',
        state: 'invalid',
        issuesOf: 'output',
        output: { name: 1 },
        issues: [
          {
            path: ['name'],
            message: 'Invalid input: expected string',
            code: 'invalid_type',
            expected: 'string',
          },
        ],
      }),
    ]

    const { panel, state } = await startWithPanel()
    expect(state.value().list[0]?.issues?.[0]?.translatedMessage).toBe('無效：string')

    // The app then loads zod; later publishes keep the SSR translation
    config.localeError = issue => `Invalid input: expected ${String(issue.expected)}`
    getOrpcInspectorStore().upsert(makeCall('c1'))
    await vi.waitFor(() => expect(state.value().list).toHaveLength(2))
    expect(state.value().list[1]?.issues?.[0]?.translatedMessage).toBe('無效：string')
    panel.close()
  })

  it('publishes records as recorded without a translator', async () => {
    const store = getOrpcInspectorStore()
    store.upsert(invalidCall())

    const { panel, state } = await startWithPanel()
    expect(state.value().list).toEqual(store.list)
    panel.close()
  })
})

describe('dock badge', () => {
  it('sums error + invalid and hides at 0', () => {
    expect(toBadge([
      makeCall('a'),
      makeCall('b'),
    ])).toEqual({ badge: undefined, badgeVariant: undefined })
    expect(toBadge([
      makeCall('a', { state: 'error' }),
      makeCall('b', { state: 'invalid' }),
      makeCall('c'),
    ]))
      .toEqual({ badge: '2', badgeVariant: 'danger' })
  })
})
