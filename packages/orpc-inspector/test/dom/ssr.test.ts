import type { OrpcCall } from '../../src/core/types'
import { beforeEach, describe, expect, it } from 'vitest'
import { getOrpcInspectorStore } from '../../src/core/store'
import { ORPC_INSPECTOR_SSR_GLOBAL } from '../../src/core/types'
import { hydrateOrpcInspector, renderOrpcInspectorScript } from '../../src/index'

function makeCall(id: string, patch: Partial<OrpcCall> = {}): OrpcCall {
  return {
    id,
    procedure: 'profile.get',
    side: 'ssr',
    state: 'success',
    startedAt: 0,
    ...patch,
  }
}

beforeEach(() => {
  getOrpcInspectorStore().clear()
})

/** U+2028, U+2029: valid in JSON but not in legacy JS strings */
const SEPARATORS = String.fromCharCode(0x2028, 0x2029)

describe('renderOrpcInspectorScript', () => {
  it('escapes </script>, <!-- and U+2028 and round-trips to the original value', () => {
    const calls = [
      makeCall('a', {
        output: {
          html: '</script><script>alert(1)</script>',
          comment: '<!-- x -->',
          amp: 'a & b',
          separators: SEPARATORS,
        },
      }),
    ]
    const html = renderOrpcInspectorScript({
      serialize: () => calls,
    })

    const doc = new DOMParser().parseFromString(`<!doctype html><html><head>${html}</head><body></body></html>`, 'text/html')
    const scripts = doc.querySelectorAll('script')
    expect(scripts).toHaveLength(1)

    const prefix = `window.${ORPC_INSPECTOR_SSR_GLOBAL}=`
    const text = scripts[0]!.textContent!
    expect(text.startsWith(prefix)).toBe(true)
    expect(text).not.toMatch(new RegExp(`[<>&${SEPARATORS}]`))
    expect(JSON.parse(text.slice(prefix.length))).toEqual(calls)
  })
})

describe('hydrateOrpcInspector', () => {
  it('merges in original order, with later client calls first', () => {
    hydrateOrpcInspector([
      makeCall('ssr-1'),
      makeCall('ssr-2'),
    ])
    getOrpcInspectorStore().upsert(makeCall('client-1', { side: 'client' }))

    expect(getOrpcInspectorStore().list.map(call => [call.id, call.side])).toEqual([
      ['client-1', 'client'],
      ['ssr-2', 'ssr'],
      ['ssr-1', 'ssr'],
    ])
  })

  it('repeated hydrate keeps one record per id', () => {
    const calls = [
      makeCall('ssr-1'),
      makeCall('ssr-2'),
    ]
    hydrateOrpcInspector(calls)
    hydrateOrpcInspector(calls)

    expect(getOrpcInspectorStore().list.map(call => call.id)).toEqual(['ssr-2', 'ssr-1'])
  })

  it('leaves the store untouched when there is no data', () => {
    hydrateOrpcInspector(undefined)
    hydrateOrpcInspector([])
    expect(getOrpcInspectorStore().list).toEqual([])
  })
})
