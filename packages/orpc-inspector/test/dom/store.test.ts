import type { OrpcCall } from '../../src/core/types'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrpcInspectorStore } from '../../src/core/store'

function makeCall(id: string, patch: Partial<OrpcCall> = {}): OrpcCall {
  return {
    id,
    procedure: 'profile.get',
    side: 'client',
    state: 'pending',
    startedAt: 0,
    ...patch,
  }
}

describe('getOrpcInspectorStore', () => {
  beforeEach(() => {
    getOrpcInspectorStore().clear()
  })

  it('puts new records first', () => {
    const store = getOrpcInspectorStore()
    store.upsert(makeCall('a'))
    store.upsert(makeCall('b'))
    expect(store.list.map(call => call.id)).toEqual(['b', 'a'])
  })

  it('updates the same id in place without adding', () => {
    const store = getOrpcInspectorStore()
    store.upsert(makeCall('a'))
    store.upsert(makeCall('b'))
    store.upsert(makeCall('a', { state: 'success' }))
    expect(store.list.map(call => [call.id, call.state])).toEqual([
      ['b', 'pending'],
      ['a', 'success'],
    ])
  })

  it('drops the oldest beyond 300 records, with the new call first', () => {
    const store = getOrpcInspectorStore()
    for (let i = 0; i < 300; i++)
      store.upsert(makeCall(`c${i}`))
    store.upsert(makeCall('new'))
    expect(store.list).toHaveLength(300)
    expect(store.list[0]?.id).toBe('new')
    expect(store.list.some(call => call.id === 'c0')).toBe(false)
    expect(store.list.at(-1)?.id).toBe('c1')
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const store = getOrpcInspectorStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    store.upsert(makeCall('a'))
    store.clear()
    off()
    store.upsert(makeCall('b'))
    expect(listener.mock.calls.map(([list]) => list.length)).toEqual([1, 0])
  })

  it('shares the same records after a module reload', async () => {
    getOrpcInspectorStore().upsert(makeCall('a'))
    vi.resetModules()
    const reloaded = await import('../../src/core/store')
    expect(reloaded.getOrpcInspectorStore().list.map(call => call.id)).toEqual(['a'])
  })
})
