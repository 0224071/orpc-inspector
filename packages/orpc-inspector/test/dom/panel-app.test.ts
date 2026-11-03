import type { OrpcCall } from '../../src/core/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

type Listener<T> = (value: T) => void

/** The devframe channel the panel connects to; holds the shared call list */
const channel = vi.hoisted(() => {
  const updated = new Set<Listener<{ list: unknown[] }>>()
  let list: unknown[] = []
  const call = vi.fn(async (_name: string) => {})
  return {
    call,
    setCalls(next: unknown[]) {
      list = next
      updated.forEach(fn => fn({ list }))
    },
    reset() {
      list = []
      updated.clear()
      call.mockClear()
    },
    create: () => ({
      status: 'connected',
      events: {
        on: () => {},
      },
      sharedState: {
        get: async () => ({
          value: () => ({ list }),
          on: (event: string, fn: Listener<{ list: unknown[] }>) => {
            if (event === 'updated') {
              updated.add(fn)
            }
          },
        }),
      },
      call,
      close: () => {},
    }),
  }
})

vi.mock('devframe/in-page-channel', () => ({
  connectPanelChannel: () => channel.create(),
}))

const { default: PanelApp } = await import('../../panel/panel-app.vue')

function call(id: string): OrpcCall {
  return {
    id,
    procedure: `proc.${id}`,
    method: 'POST',
    side: 'client',
    state: 'success',
    startedAt: 0,
    status: 200,
  }
}

function stubWidth(narrow: boolean) {
  const listeners = new Set<Listener<{ matches: boolean }>>()
  const query = {
    get matches() {
      return narrow
    },
    addEventListener: (_: string, fn: Listener<{ matches: boolean }>) => listeners.add(fn),
    removeEventListener: (_: string, fn: Listener<{ matches: boolean }>) => listeners.delete(fn),
  }
  vi.stubGlobal('matchMedia', () => query)
  return (next: boolean) => {
    narrow = next
    listeners.forEach(fn => fn({ matches: next }))
  }
}

const flush = () => new Promise(resolve => setTimeout(resolve))

function key(target: HTMLElement, name: string, init: KeyboardEventInit = {}, type = 'keydown') {
  const event = new KeyboardEvent(type, {
    key: name,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

async function mount() {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp(PanelApp)
  app.mount(root)
  await flush()
  await nextTick()
  return {
    root,
    unmount: () => {
      app.unmount()
      root.remove()
    },
    body: () => root.querySelector('.body')!,
    items: () => [
      ...root.querySelectorAll<HTMLElement>('.item'),
    ],
    back: () => root.querySelector<HTMLButtonElement>('.back'),
  }
}

describe('panel-app narrow layout', () => {
  let panel: Awaited<ReturnType<typeof mount>> | undefined

  beforeEach(() => {
    localStorage.clear()
    channel.reset()
    channel.setCalls([
      call('a'),
      call('b'),
      call('c'),
    ])
  })

  afterEach(() => {
    panel?.unmount()
    panel = undefined
    vi.unstubAllGlobals()
  })

  it('opens the detail on select and keeps the row highlighted after going back', async () => {
    stubWidth(true)
    panel = await mount()
    expect(panel.body().classList).toContain('is-list')

    panel.items()[1]!.click()
    await flush()
    expect(panel.body().classList).toContain('is-detail')
    expect(document.activeElement).toBe(panel.back())

    panel.back()!.click()
    await flush()
    expect(panel.body().classList).toContain('is-list')
    const selected = panel.root.querySelector('.item.is-selected')
    expect(selected?.textContent).toContain('proc.b')
    expect(document.activeElement).toBe(selected)
  })

  it('selects a row from the keyboard', async () => {
    stubWidth(true)
    panel = await mount()
    const row = panel.items()[2]!
    expect(row.tabIndex).toBe(0)

    const enter = key(row, 'Enter')
    await flush()
    expect(enter.defaultPrevented).toBe(true)
    expect(panel.body().classList).toContain('is-detail')
    expect(document.activeElement).toBe(panel.back())

    panel.back()!.click()
    await flush()
    // Space selects on keyup, like a native button, so the back control never sees it
    const first = panel.items()[0]!
    const space = key(first, ' ')
    await flush()
    expect(space.defaultPrevented).toBe(true)
    expect(panel.root.querySelector('.item.is-selected')?.textContent).toContain('proc.c')
    key(first, ' ', {}, 'keyup')
    await flush()
    expect(panel.root.querySelector('.item.is-selected')?.textContent).toContain('proc.a')
    expect(document.activeElement).toBe(panel.back())
  })

  it('ignores modified and repeated keys on a row', async () => {
    stubWidth(true)
    panel = await mount()
    const row = panel.items()[0]!

    const modified = key(row, 'Enter', { ctrlKey: true })
    const repeated = key(row, 'Enter', { repeat: true })
    await flush()
    expect(modified.defaultPrevented).toBe(false)
    expect(repeated.defaultPrevented).toBe(true)
    expect(panel.root.querySelector('.item.is-selected')).toBeNull()
  })

  it('focuses another row or the list when the selected call is filtered out', async () => {
    stubWidth(true)
    panel = await mount()
    const search = panel.root.querySelector<HTMLInputElement>('.search')!
    const filterBy = async (word: string) => {
      search.value = word
      search.dispatchEvent(new Event('input'))
      await flush()
    }

    // Hiding the selected call returns to the list and moves focus off the removed back control
    panel.items()[1]!.click()
    await flush()
    expect(document.activeElement).toBe(panel.back())
    await filterBy('proc.c')
    expect(panel.body().classList).toContain('is-list')
    expect(document.activeElement).toBe(panel.items()[0])
    expect(panel.items()[0]!.textContent).toContain('proc.c')

    panel.items()[0]!.click()
    await flush()
    await filterBy('nothing')
    expect(panel.body().classList).toContain('is-list')
    expect(document.activeElement).toBe(panel.root.querySelector('.list'))
  })

  it('goes back to the list when the shown call is cleared', async () => {
    stubWidth(true)
    panel = await mount()
    panel.items()[0]!.click()
    await flush()

    panel.root.querySelector<HTMLButtonElement>('.clear')!.click()
    expect(channel.call).toHaveBeenCalledWith('calls:clear')
    channel.setCalls([])
    await flush()
    expect(panel.body().classList).toContain('is-list')
    expect(panel.back()).toBeNull()
    expect(panel.root.querySelector('.empty')).not.toBeNull()
  })

  it('switches layout when the panel crosses 640px', async () => {
    const setNarrow = stubWidth(false)
    panel = await mount()
    panel.items()[0]!.click()
    await flush()
    expect([
      ...panel.body().classList,
    ].filter(name => name.startsWith('is-'))).toEqual([])
    expect(panel.back()).toBeNull()

    setNarrow(true)
    await flush()
    expect(panel.body().classList).toContain('is-detail')

    panel.back()!.click()
    await flush()
    expect(panel.body().classList).toContain('is-list')

    setNarrow(false)
    await flush()
    expect([
      ...panel.body().classList,
    ].filter(name => name.startsWith('is-'))).toEqual([])
    expect(panel.root.querySelector('.detail .summary')).not.toBeNull()
  })

  it('keeps focus on a shown element when the panel crosses 640px', async () => {
    const setNarrow = stubWidth(false)
    panel = await mount()
    const row = panel.items()[1]!
    row.focus()
    key(row, 'Enter')
    await flush()
    expect(document.activeElement).toBe(row)

    // The focused list is hidden
    setNarrow(true)
    await flush()
    expect(document.activeElement).toBe(panel.back())

    // The focused back control is removed
    setNarrow(false)
    await flush()
    expect(document.activeElement).toBe(panel.root.querySelector('.item.is-selected'))

    // The focused details are hidden after back
    setNarrow(true)
    await flush()
    panel.back()!.click()
    await flush()
    setNarrow(false)
    await flush()
    panel.root.querySelector<HTMLElement>('.detail button')!.focus()
    setNarrow(true)
    await flush()
    expect(panel.body().classList).toContain('is-list')
    expect(document.activeElement).toBe(panel.root.querySelector('.item.is-selected'))
  })
})

describe('panel-app selected call hidden by the search or a filter', () => {
  let panel: Awaited<ReturnType<typeof mount>> | undefined

  const errorCall: OrpcCall = {
    ...call('createUser'),
    procedure: 'createUser',
    state: 'error',
    status: 400,
    error: {
      name: 'Error',
      message: 'Bad request',
      data: {
        headers: { authorization: 'Bearer secret' },
      },
    },
  }

  beforeEach(() => {
    localStorage.clear()
    channel.reset()
    channel.setCalls([
      errorCall,
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
  })

  afterEach(() => {
    panel?.unmount()
    panel = undefined
    vi.unstubAllGlobals()
  })

  async function search(word: string) {
    const input = panel!.root.querySelector<HTMLInputElement>('.search')!
    input.value = word
    input.dispatchEvent(new Event('input'))
    await flush()
  }

  async function setFilter(index: number) {
    panel!.root.querySelectorAll<HTMLButtonElement>('.filters button')[index]!.click()
    await flush()
  }

  const details = () => panel!.root.querySelector<HTMLElement>('.detail:not(.empty)')
  const shown = (el: HTMLElement | null) => !!el && el.style.display !== 'none'
  const notice = () => panel!.root.querySelector<HTMLElement>('.detail.empty')
  const highlighted = () => panel!.root.querySelector('.item.is-selected')

  it('shows a notice instead of the details when the search hides the selected call', async () => {
    stubWidth(false)
    panel = await mount()
    panel.items()[0]!.click()
    await flush()

    await search('hello')
    expect(panel.items().map(item => item.textContent)).toEqual([
      expect.stringContaining('hello'),
    ])
    expect(highlighted()).toBeNull()
    expect(shown(details())).toBe(false)
    expect(notice()?.textContent).toContain('The selected call is not in the current results')

    await search('')
    expect(highlighted()?.textContent).toContain('createUser')
    expect(shown(details())).toBe(true)
    expect(details()!.textContent).toContain('createUser')
    expect(notice()).toBeNull()
  })

  it('hides and restores the details with a filter', async () => {
    stubWidth(false)
    panel = await mount()
    panel.items()[1]!.click()
    await flush()

    await setFilter(1)
    expect(highlighted()).toBeNull()
    expect(shown(details())).toBe(false)
    expect(notice()?.textContent).toContain('The selected call is not in the current results')

    await setFilter(0)
    expect(shown(details())).toBe(true)
    expect(details()!.textContent).toContain('hello')
    expect(highlighted()?.textContent).toContain('hello')
  })

  it('keeps a revealed error data header revealed after hide and show', async () => {
    stubWidth(false)
    panel = await mount()
    panel.items()[0]!.click()
    await flush()
    const reveal = () => details()!.querySelector<HTMLButtonElement>('.tree .reveal')
    reveal()!.click()
    await flush()
    expect(details()!.textContent).toContain('Bearer secret')

    await search('hello')
    await search('')
    expect(reveal()).toBeNull()
    expect(details()!.textContent).toContain('Bearer secret')
  })

  it('returns to the list in the narrow layout and stays there when the call comes back', async () => {
    stubWidth(true)
    panel = await mount()
    panel.items()[0]!.click()
    await flush()
    expect(panel.body().classList).toContain('is-detail')

    await search('hello')
    expect(panel.body().classList).toContain('is-list')
    expect(panel.back()).toBeNull()
    expect(panel.items().map(item => item.textContent)).toEqual([
      expect.stringContaining('hello'),
    ])

    await search('')
    expect(panel.body().classList).toContain('is-list')
    expect(highlighted()?.textContent).toContain('createUser')
    expect(panel.back()).toBeNull()

    panel.items()[0]!.click()
    await flush()
    expect(panel.body().classList).toContain('is-detail')
  })
})

describe('panel-app empty call list', () => {
  let panel: Awaited<ReturnType<typeof mount>> | undefined

  beforeEach(() => {
    localStorage.clear()
    channel.reset()
    stubWidth(false)
  })

  afterEach(() => {
    panel?.unmount()
    panel = undefined
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const empty = () => panel!.root.querySelector<HTMLElement>('.list .empty')
  const message = () => empty()?.querySelector('p')?.textContent?.trim()
  const reset = () => panel!.root.querySelector<HTMLButtonElement>('.list .empty button')
  const searchBox = () => panel!.root.querySelector<HTMLInputElement>('.search')!
  const activeFilter = () => panel!.root.querySelector('.filters button.is-active')

  async function search(word: string) {
    const input = searchBox()
    input.value = word
    input.dispatchEvent(new Event('input'))
    await flush()
  }

  it('shows "No calls yet" when nothing is recorded', async () => {
    panel = await mount()
    expect(message()).toBe('No calls yet')
  })

  it('shows "No matching calls" when the search matches nothing', async () => {
    channel.setCalls([
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
    panel = await mount()
    await search('zzz')
    expect(panel.items()).toEqual([])
    expect(message()).toBe('No matching calls')
  })

  it('shows "No matching calls" when the filter matches nothing', async () => {
    channel.setCalls([
      call('a'),
      call('b'),
    ])
    panel = await mount()
    panel.root.querySelectorAll<HTMLButtonElement>('.filters button')[1]!.click()
    await flush()
    expect(panel.items()).toEqual([])
    expect(message()).toBe('No matching calls')
  })

  it('shows the records again after clearing the search', async () => {
    channel.setCalls([
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
    panel = await mount()
    await search('zzz')
    await search('')
    expect(panel.items().map(item => item.textContent)).toEqual([
      expect.stringContaining('hello'),
    ])
    expect(empty()).toBeNull()
  })

  it('shows "No calls yet" after clearing the records while searching', async () => {
    channel.setCalls([
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
    panel = await mount()
    await search('zzz')
    panel.root.querySelector<HTMLButtonElement>('.clear')!.click()
    expect(channel.call).toHaveBeenCalledWith('calls:clear')
    channel.setCalls([])
    await flush()
    expect(message()).toBe('No calls yet')
  })

  it('shows "沒有符合的呼叫" in Traditional Chinese', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-TW')
    channel.setCalls([
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
    panel = await mount()
    await search('zzz')
    expect(message()).toBe('沒有符合的呼叫')
  })

  it('resets the search and filter with "Clear search and filter"', async () => {
    channel.setCalls([
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
    panel = await mount()
    panel.root.querySelectorAll<HTMLButtonElement>('.filters button')[1]!.click()
    await search('zzz')
    expect(reset()?.textContent?.trim()).toBe('Clear search and filter')
    expect(reset()!.type).toBe('button')

    reset()!.click()
    await flush()
    expect(searchBox().value).toBe('')
    expect(activeFilter()).toBe(panel.root.querySelectorAll('.filters button')[0])
    expect(panel.items().map(item => item.textContent)).toEqual([
      expect.stringContaining('hello'),
    ])
    expect(empty()).toBeNull()
    expect(document.activeElement).toBe(panel.items()[0])
  })

  it('moves focus to the selected row after the reset', async () => {
    channel.setCalls([
      call('a'),
      call('b'),
    ])
    panel = await mount()
    panel.items()[1]!.click()
    await flush()
    await search('zzz')
    reset()!.focus()
    // A keyboard user presses Enter here, but happy-dom does not turn a dispatched Enter keydown into a button click, so click() stands in for it.
    reset()!.click()
    await flush()
    expect(document.activeElement).toBe(panel.items()[1])
    expect(panel.items()[1]!.classList).toContain('is-selected')
  })

  it('shows no reset button when nothing is recorded', async () => {
    panel = await mount()
    expect(reset()).toBeNull()
    await search('zzz')
    expect(message()).toBe('No calls yet')
    expect(reset()).toBeNull()
  })

  it('shows "清除搜尋與篩選" in Traditional Chinese', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-TW')
    channel.setCalls([
      {
        ...call('hello'),
        procedure: 'hello',
      },
    ])
    panel = await mount()
    await search('zzz')
    expect(reset()?.textContent?.trim()).toBe('清除搜尋與篩選')
  })
})

describe('panel-app input issues outside the recorded input', () => {
  let panel: Awaited<ReturnType<typeof mount>> | undefined

  function failure(input: unknown, paths: (string | number)[][], source: 'client' | 'server'): OrpcCall {
    return {
      ...call('createUser'),
      procedure: 'createUser',
      state: 'error',
      status: source === 'server'
        ? 400
        : undefined,
      input,
      issues: paths.map(path => ({ path, message: `Invalid ${path.join('.')}` })),
      issuesOf: 'input',
      issuesSource: source,
      error: {
        name: 'ORPCError',
        code: 'BAD_REQUEST',
        message: 'Input validation failed',
      },
    }
  }

  async function open(record: OrpcCall) {
    localStorage.clear()
    channel.reset()
    channel.setCalls([record])
    stubWidth(false)
    // happy-dom cannot parse the selector the jump builds with CSS.escape; resolve data-path lookups by hand
    vi.stubGlobal('CSS', {
      escape: (text: string) => text,
    })
    const querySelector = Element.prototype.querySelector
    vi.spyOn(Element.prototype, 'querySelector').mockImplementation(function (this: Element, selector: string) {
      const path = /^\[data-path="(.*)"\]$/.exec(selector)?.[1]
      return path === undefined
        ? querySelector.call(this, selector)
        : [
            ...this.querySelectorAll<HTMLElement>('[data-path]'),
          ].find(el => el.dataset.path === path) ?? null
    })
    panel = await mount()
    panel.items()[0]!.click()
    await flush()
  }

  afterEach(() => {
    panel?.unmount()
    panel = undefined
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const inputTree = () => panel!.root.querySelectorAll<HTMLElement>('.tree')[1]!
  const rows = () => [
    ...inputTree().querySelectorAll<HTMLElement>('.row'),
  ]
  const rowPaths = () => rows().map(row => row.dataset.path)
  const row = (path: string[]) => rows().find(item => item.dataset.path === JSON.stringify(path))
  const mainItems = () => [
    ...panel!.root.querySelectorAll<HTMLElement>('.issues > ul:not(.not-in-input) > li'),
  ]
  const outsideItems = () => [
    ...panel!.root.querySelectorAll<HTMLElement>('.issues > ul.not-in-input > li'),
  ]
  const paths = (items: HTMLElement[]) => items.map(item => item.querySelector('code')!.textContent)

  it('keeps server issues for fields that were not sent out of the input tree', async () => {
    await open(failure({ id: 'orpc-400' }, [
      ['email'],
      ['age'],
    ], 'server'))

    expect(rowPaths()).toEqual(['[]', '["id"]'])
    expect(inputTree().querySelector('.missing')).toBeNull()
    expect(panel!.root.querySelector('.issues h3')!.textContent).toContain('2 issues')
    expect(mainItems()).toEqual([])
    expect(panel!.root.querySelector('.issues .not-in-input-label')!.textContent).toBe('Not in the recorded input')
    expect(paths(outsideItems())).toEqual(['email', 'age'])
    for (const item of outsideItems()) {
      expect(item.hasAttribute('tabindex')).toBe(false)
      expect(item.hasAttribute('title')).toBe(false)
      expect(item.classList.contains('is-link')).toBe(false)
    }
  })

  it('splits server issues inside and outside the recorded input', async () => {
    await open(failure({ name: 'A' }, [
      ['name'],
      ['email'],
    ], 'server'))

    expect(paths(mainItems())).toEqual(['name'])
    expect(paths(outsideItems())).toEqual(['email'])
    expect(row(['email'])).toBeUndefined()
    expect(row(['name'])!.classList.contains('is-bad')).toBe(true)

    mainItems()[0]!.click()
    await flush()
    expect(row(['name'])!.classList.contains('is-flash')).toBe(true)
  })

  it('splits server issues of array items by whether the item was recorded', async () => {
    await open(failure({
      items: [
        { sku: 'a' },
      ],
    }, [
      ['items', 0, 'sku'],
      ['items', 2, 'sku'],
    ], 'server'))

    expect(paths(mainItems())).toEqual(['items[0].sku'])
    expect(paths(outsideItems())).toEqual(['items[2].sku'])
    expect(rowPaths()).toEqual([
      '[]',
      '["items"]',
      '["items","0"]',
      '["items","0","sku"]',
    ])
  })

  it('keeps a server issue with a string array index in the main list and jumps to it', async () => {
    await open(failure({
      items: [
        { sku: 'a' },
      ],
    }, [
      ['items', '0', 'sku'],
    ], 'server'))

    expect(outsideItems()).toEqual([])
    expect(mainItems()).toHaveLength(1)
    expect(row(['items', '0', 'sku'])!.classList.contains('is-bad')).toBe(true)

    mainItems()[0]!.click()
    await flush()
    expect(row(['items', '0', 'sku'])!.classList.contains('is-flash')).toBe(true)
  })

  it('cycles a merged server issue only through the items in the recorded input', async () => {
    await open({
      ...failure({
        items: [
          { sku: 'a' },
          { sku: 'b' },
        ],
      }, [], 'server'),
      issues: [0, 1, 5].map(index => ({
        path: ['items', index, 'sku'],
        message: 'Required',
      })),
    })

    expect(paths(mainItems())).toEqual(['items[*].sku'])
    expect(mainItems()[0]!.querySelector('.count')!.textContent).toContain('×2')
    expect(paths(outsideItems())).toEqual(['items[5].sku'])

    const flashed = () => rows().filter(item => item.classList.contains('is-flash')).map(item => item.dataset.path)
    const jumps: (string | undefined)[][] = []
    for (let i = 0; i < 3; i++) {
      mainItems()[0]!.click()
      await flush()
      jumps.push(flashed())
    }
    expect(jumps).toEqual([
      ['["items","0","sku"]'],
      ['["items","1","sku"]'],
      ['["items","0","sku"]'],
    ])
  })

  it('shows the translated message outside the recorded input and keeps the original', async () => {
    await open({
      ...failure({ id: 'a' }, [], 'server'),
      issues: [
        {
          path: ['email'],
          message: 'Required',
          translatedMessage: '必填',
        },
      ],
    })

    const message = outsideItems()[0]!.querySelector<HTMLElement>('.message')!
    expect(message.firstChild!.textContent!.trim()).toBe('必填')
    expect(message.title).toBe('Original: Required')
    expect(message.querySelector('.sr-only')!.textContent).toBe('Original: Required')
  })

  it('still shows a missing row for a client issue and jumps to it', async () => {
    await open(failure({ id: 'a' }, [
      ['email'],
    ], 'client'))

    expect(row(['email'])!.querySelector('.missing')).not.toBeNull()
    expect(outsideItems()).toEqual([])
    expect(paths(mainItems())).toEqual(['email'])

    mainItems()[0]!.click()
    await flush()
    expect(row(['email'])!.classList.contains('is-flash')).toBe(true)
  })
})

describe('panel-app call list row markers', () => {
  let panel: Awaited<ReturnType<typeof mount>> | undefined

  beforeEach(() => {
    localStorage.clear()
    channel.reset()
    stubWidth(false)
  })

  afterEach(() => {
    panel?.unmount()
    panel = undefined
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const row = (procedure: string) => panel!.items().find(item => item.textContent?.includes(procedure))!
  const indicator = (procedure: string) => row(procedure).querySelector<HTMLElement>('[role="img"]')!
  const reasonTags = (procedure: string) =>
    [
      ...row(procedure).querySelectorAll('.tag.is-reason'),
    ].map(tag => tag.textContent?.trim())

  const invalid = (id: string, extra: Partial<OrpcCall>): OrpcCall => ({
    ...call(id),
    state: 'invalid',
    issues: [
      {
        path: ['name'],
        message: 'Required',
      },
    ],
    ...extra,
  })

  it('gives pending, streaming and cancelled different indicators named by state', async () => {
    channel.setCalls([
      {
        ...call('p'),
        state: 'pending',
        status: undefined,
      },
      {
        ...call('s'),
        state: 'streaming',
      },
      {
        ...call('c'),
        state: 'cancelled',
      },
    ])
    panel = await mount()
    const looks = ['proc.p', 'proc.s', 'proc.c'].map(p => indicator(p).className)
    expect(new Set(looks).size).toBe(3)
    expect(['proc.p', 'proc.s', 'proc.c'].map(p => indicator(p).getAttribute('aria-label'))).toEqual(['Pending', 'Streaming', 'Cancelled'])
    expect(indicator('proc.s').title).toBe('Streaming')
  })

  it('names the invalid mark by state and keeps the reason in its tooltip', async () => {
    channel.setCalls([
      invalid('o', { issuesOf: 'output' }),
    ])
    panel = await mount()
    expect(indicator('proc.o').getAttribute('aria-label')).toBe('Invalid')
    expect(indicator('proc.o').title).toBe('Response does not match schema')
  })

  it('shows one reason tag per invalid row', async () => {
    channel.setCalls([
      invalid('out', { issuesOf: 'output' }),
      invalid('unsent', { issuesOf: 'input', issuesSource: 'client', status: undefined }),
      invalid('rejected', { issuesOf: 'input', issuesSource: 'server', status: 400 }),
      call('ok'),
    ])
    panel = await mount()
    expect(reasonTags('proc.out')).toEqual(['Response'])
    expect(reasonTags('proc.unsent')).toEqual(['Not sent'])
    expect(reasonTags('proc.rejected')).toEqual(['Server'])
    expect(reasonTags('proc.ok')).toEqual([])
  })

  it('shows the state name and tags in Traditional Chinese', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('zh-TW')
    channel.setCalls([
      {
        ...call('s'),
        state: 'streaming',
      },
      invalid('unsent', { issuesOf: 'input', issuesSource: 'client', status: undefined }),
    ])
    panel = await mount()
    expect(indicator('proc.s').getAttribute('aria-label')).toBe('串流中')
    expect(reasonTags('proc.unsent')).toEqual(['未送出'])
  })

  it('shows the SSR tag only on SSR rows', async () => {
    channel.setCalls([
      {
        ...call('server'),
        side: 'ssr',
      },
      call('browser'),
    ])
    panel = await mount()
    const ssrTag = (procedure: string) => [
      ...row(procedure).querySelectorAll('.tag'),
    ].some(tag => tag.textContent?.trim() === 'SSR')
    expect(ssrTag('proc.server')).toBe(true)
    expect(ssrTag('proc.browser')).toBe(false)
  })
})
