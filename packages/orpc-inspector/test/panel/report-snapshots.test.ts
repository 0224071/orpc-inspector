import type { OrpcCall } from '../../src/core/types'
import { describe, expect, it } from 'vitest'
import { buildCallReport, buildErrorsReport } from '../../panel/report'
import { builtinTemplates, withDefaults } from '../../panel/report-presets'
import { buildReportPreview } from '../../panel/report-preview'

const startedAt = new Date(2026, 0, 2, 3, 4, 5).getTime()
const base: Pick<OrpcCall, 'side' | 'method' | 'startedAt' | 'duration'> = {
  side: 'client',
  method: 'POST',
  startedAt,
  duration: 21,
}

// Stable record-shaped fixtures corresponding to the playground scenarios.
const validation: OrpcCall = {
  ...base,
  id: 'validation',
  procedure: 'profile.update',
  state: 'invalid',
  input: { name: 'X', email: 'not-an-email' },
  issuesOf: 'input',
  issuesSource: 'client',
  issues: [
    {
      path: ['name'],
      code: 'too_small',
      message: 'Too small: expected string to have >=2 characters',
    },
    {
      path: ['email'],
      code: 'invalid_format',
      message: 'Invalid email address',
    },
  ],
}
const server: OrpcCall = {
  ...base,
  id: 'server',
  procedure: 'profile.update',
  url: 'http://localhost:3000/rpc/profile/update',
  state: 'error',
  status: 409,
  input: { name: 'Ming Wang', email: 'ming@taken.example' },
  error: { name: 'Error', code: 'CONFLICT', message: 'Email is already in use' },
}
const stream: OrpcCall = {
  ...base,
  id: 'stream',
  procedure: 'diagnostics.stream',
  url: 'http://localhost:3000/rpc/diagnostics/stream',
  state: 'error',
  status: 200,
  input: { count: 4 },
  events: Array.from({ length: 4 }, (_, sequence) => ({ sequence, token: 'playground-event-token' })),
  eventCount: 4,
  error: { name: 'Error', code: 'INTERNAL_SERVER_ERROR', message: 'Stream failed after sending events' },
}
const retry: OrpcCall = {
  ...base,
  id: 'retry',
  procedure: 'diagnostics.retry',
  url: 'http://localhost:3000/rpc/diagnostics/retry',
  state: 'error',
  status: 503,
  attempts: Array.from({ length: 3 }, () => ({
    method: 'POST',
    url: 'http://localhost:3000/rpc/diagnostics/retry',
    status: 503,
  })),
  error: { name: 'Error', code: 'SERVICE_UNAVAILABLE', message: 'Playground service is unavailable' },
}
const ssr: OrpcCall = {
  ...base,
  id: 'ssr',
  procedure: 'profile.get',
  url: 'http://localhost:3000/rpc/profile/get',
  side: 'ssr',
  state: 'success',
  status: 200,
  output: { name: 'Ming Wang', email: 'ming@example.com' },
}
const preserved: OrpcCall = {
  ...server,
  id: 'preserved',
  fromPreviousPage: true,
}
const fixtures = [
  validation,
  server,
  stream,
  retry,
  ssr,
  preserved,
]

describe.each(builtinTemplates())('$name reports', ({ options }) => {
  describe.each(['classic', 'diagnostic'] as const)('%s', (layout) => {
    const config = { ...options, layout }

    it.each(fixtures)('copies $id', (call) => {
      const text = buildCallReport(call, config)
      expect(text).not.toContain('playground-event-token')
      expect(text).toMatchSnapshot()
    })

    it('copies the visible error batch', () => {
      const text = buildErrorsReport(fixtures, config)
      if (options.maxLength)
        expect(text.length).toBeLessThanOrEqual(options.maxLength)
      expect(text).toMatchSnapshot()
    })
  })
})

const markdown = builtinTemplates()[0]!.options
const diagnostic = { ...markdown, layout: 'diagnostic' as const }

it('keeps classic when a saved template has no layout', () => {
  expect(withDefaults({}, markdown).layout).toBe('classic')
  expect(withDefaults({ layout: 'diagnostic' }, markdown).layout).toBe('diagnostic')
})

it('uses compact JSON if it preserves both payloads within the cap', () => {
  const call: OrpcCall = {
    ...server,
    input: {
      values: Array.from({ length: 12 }, (_, i) => i),
    },
    error: {
      ...server.error!,
      data: { detail: 'server detail' },
    },
  }
  const maxLength = buildCallReport(call, diagnostic).length - 10
  const text = buildCallReport(call, { ...diagnostic, maxLength })
  expect(text.length).toBeLessThanOrEqual(maxLength)
  expect(text).toContain('{"values":[0,1,2,3,4,5,6,7,8,9,10,11]}')
  expect(text).toContain('{"detail":"server detail"}')
  expect(text).not.toContain('Evidence omitted')
})

it('discloses omitted input when the limit cannot fit it', () => {
  const text = buildCallReport(
    {
      ...server,
      input: {
        value: 'x'.repeat(2000),
      },
    },
    { ...diagnostic, maxLength: 450 },
  )
  expect(text).toContain('Input is not included.')
  expect(text).toContain('Evidence omitted')
  expect(text).toContain('CONFLICT')
  expect(text).not.toContain('Use the Input below')
  expect(text.length).toBeLessThanOrEqual(450)
})

it('does not reuse hidden issues or missing input in the diagnostic summary', () => {
  const text = buildCallReport({
    ...validation,
    input: undefined,
    fromPreviousPage: true,
    notPreserved: {
      fields: ['input'],
      size: 70 * 1024,
    },
  }, {
    ...diagnostic,
    sections: { ...diagnostic.sections, issues: false },
  })
  expect(text).not.toContain('expected string')
  expect(text).toContain('Input was not preserved.')
  expect(text).toContain('original was blocked before send')
})

it('previews errors, a selected call or a synthetic example', () => {
  expect(buildReportPreview(markdown, [server, ssr], ssr).source).toBe('errors')
  expect(buildReportPreview(markdown, [ssr], ssr).source).toBe('selected')
  expect(buildReportPreview(markdown, []).source).toBe('example')
  expect(buildReportPreview(markdown, []).text).toContain('### ')
  expect(buildReportPreview(builtinTemplates()[2]!.options, []).text).not.toContain('### ')
})
