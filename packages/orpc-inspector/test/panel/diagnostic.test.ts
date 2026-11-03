import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLIENT_SCRIPT_WAIT_MS, diagnose, DISCONNECTED_CAUSES, isEmbedded } from '../../panel/diagnostic'
import { messages } from '../../panel/i18n'

describe('disconnected diagnostic', () => {
  it('marks the standalone URL right away for a top-level page with no opener', () => {
    expect(diagnose({ status: 'connecting', embedded: false, elapsed: 0 })).toEqual({ show: true, marked: 'standalone' })
  })

  it('lists causes with none marked while an embedded panel is still saying hello', () => {
    expect(diagnose({ status: 'connecting', embedded: true, elapsed: CLIENT_SCRIPT_WAIT_MS - 1 })).toEqual({ show: true })
  })

  it('marks the client script once an embedded panel waited about 3 seconds', () => {
    expect(diagnose({ status: 'connecting', embedded: true, elapsed: CLIENT_SCRIPT_WAIT_MS })).toEqual({ show: true, marked: 'clientScript' })
    expect(CLIENT_SCRIPT_WAIT_MS).toBe(3000)
  })

  it('treats closed like connecting', () => {
    expect(diagnose({ status: 'closed', embedded: false, elapsed: 0 }).show).toBe(true)
  })

  it('shows no diagnostic state when connected', () => {
    expect(diagnose({ status: 'connected', embedded: false, elapsed: 0 })).toEqual({ show: false })
    expect(diagnose({ status: 'connected', embedded: true, elapsed: 10_000 })).toEqual({ show: false })
  })

  it('treats a parent frame or an opener as embedded', () => {
    const top = { opener: null } as unknown as Window & { parent: Window }
    top.parent = top
    expect(isEmbedded(top)).toBe(false)
    expect(isEmbedded({ ...top, parent: {} as Window } as Window)).toBe(true)
    const opened = { opener: {} } as unknown as Window & { parent: Window }
    opened.parent = opened
    expect(isEmbedded(opened)).toBe(true)
  })

  it('has copy for the headline, every cause, the mark and retry in both languages', () => {
    const keys = [
      'panel.waiting',
      'panel.causesHeading',
      'panel.causeMarked',
      'panel.retry',
      ...DISCONNECTED_CAUSES.map(cause => `panel.cause.${cause}`),
    ]
    for (const dictionary of Object.values(messages)) {
      for (const key of keys)
        expect(dictionary[key as keyof typeof dictionary], key).toBeTruthy()
    }
  })

  it('does not mention authorization in the waiting copy', () => {
    for (const dictionary of Object.values(messages)) {
      const copy = Object.entries(dictionary).filter(([key]) => key.startsWith('panel.cause')).map(([, text]) => text).join(' ')
      expect(copy).not.toMatch(/authoriz|password|授權|密碼/i)
    }
  })

  it('renders the call list only when the diagnostic state is hidden, and retry reloads', () => {
    const source = readFileSync(fileURLToPath(new URL('../../panel/panel-app.vue', import.meta.url)), 'utf8')
    expect(source).toMatch(/<section v-if="diagnostic\.show" class="diagnostic[ "][\s\S]*?<\/section>\s*<div v-else class="body[ "]/)
    expect(source).not.toContain(`status !== 'connected'`)
    expect(source).toContain('location.reload()')
  })
})
