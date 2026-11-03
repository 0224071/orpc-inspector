import type { ReportOptions } from '../../panel/report'
import type { OrpcCall } from '../../src/core/types'
import { describe, expect, it } from 'vitest'
import {
  buildCallReport,
  buildErrorsReport,
  trimJson,
} from '../../panel/report'
import {
  builtinTemplates,
  matchPreset,
  SYNTAX_PRESETS,
  withDefaults,
} from '../../panel/report-presets'

const [markdown, discord, line] = builtinTemplates().map(template => template.options) as [
  ReportOptions,
  ReportOptions,
  ReportOptions,
]

/** LINE template with the Plain text syntax preset */
const plain: ReportOptions = {
  ...line,
  syntax: syntaxPreset('Plain text'),
}

function syntaxPreset(id: string) {
  return structuredClone(SYNTAX_PRESETS.find(preset => preset.id === id)!.value)
}

const invalidCall: OrpcCall = {
  id: '1',
  procedure: 'orders.list',
  method: 'GET',
  url: '/api/orders',
  status: 200,
  side: 'ssr',
  state: 'invalid',
  startedAt: 0,
  duration: 27,
  input: { page: 1, accessToken: 'abc' },
  output: {
    data: [
      { id: 'A', price: '10' },
      { id: 'B', price: '20' },
      { id: 'C', price: 'x|y' },
    ],
  },
  issues: [0, 1]
    .map(i => ({
      path: ['data', i, 'zip'],
      message: 'expected string',
    }))
    .concat([
      {
        path: ['data', 0, 'price'],
        message: 'expected number',
      },
      {
        path: ['data', 2, 'price'],
        message: 'expected number',
      },
    ]),
}

const errorCall: OrpcCall = {
  id: '2',
  procedure: 'profile.update',
  method: 'PATCH',
  status: 409,
  side: 'client',
  state: 'error',
  startedAt: 0,
  error: {
    name: 'ORPCError',
    code: 'CONFLICT',
    message: 'Data has been modified',
    data: { reason: 'stale' },
  },
}

describe('buildCallReport (Markdown template)', () => {
  const report = buildCallReport(invalidCall, markdown)

  it('renders heading and request info', () => {
    expect(report).toContain('### ❌ Response does not match schema — `orders.list`')
    expect(report).toContain('- **Request**: GET /api/orders → 200 (SSR)')
    expect(report).toMatch(/- \*\*Time\*\*: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} · 27ms/)
  })

  it('merges same-field issues in the table, marks missing fields and trails differing values with …', () => {
    expect(report).toContain('| Field | Code | Issue | Actual value |')
    // Issues without a code leave the code cell empty
    expect(report).toContain('| `data[*].zip` ×2 (items 0–1) |  | expected string | ‹missing› |')
    expect(report).toContain('| `data[*].price` ×2 (items 0, 2) |  | expected number | `"10"`, … |')
  })

  it('collapses the full response in details and masks sensitive input fields', () => {
    expect(report).toContain('<details><summary>Response</summary>')
    expect(report).toContain('"accessToken": "***"')
    expect(report).not.toContain('abc')
  })

  it('shows the HTTP error name and data when the request fails', () => {
    const text = buildCallReport(errorCall, markdown)
    expect(text).toContain('### ⚠️ Error — `profile.update`')
    expect(text).toContain('**ORPCError · CONFLICT**: Data has been modified')
    expect(text).toContain('<details><summary>Error data</summary>')
  })

  it('reports successful calls with Input and an expanded Response regardless of the template', () => {
    const successCall: OrpcCall = {
      ...invalidCall,
      state: 'success',
      issues: undefined,
      output: {
        data: [
          { id: 'A', price: 10 },
        ],
      },
    }
    const brief = {
      ...markdown,
      sections: { ...markdown.sections, input: false, output: false },
    }
    const text = buildCallReport(successCall, brief)
    expect(text).toContain('### ✅ Success — `orders.list`')
    expect(text).toContain('"accessToken": "***"')
    expect(text).toContain('"price": 10')
    expect(text).not.toContain('<details>')
  })
})

describe('buildErrorsReport', () => {
  it('includes only invalid / error calls, joined by separators', () => {
    const success: OrpcCall = {
      ...errorCall,
      id: '3',
      state: 'success',
      error: undefined,
    }
    const text = buildErrorsReport([invalidCall, success, errorCall], markdown)
    expect(text.startsWith('## oRPC error report (2 calls)')).toBe(true)
    expect(text.split('\n\n---\n\n')).toHaveLength(3)
  })

  it('merges calls with identical errors and shows the count', () => {
    const text = buildErrorsReport(
      [
        errorCall,
        { ...errorCall, id: '4' },
        { ...errorCall, id: '5' },
      ],
      discord,
    )
    expect(text).toContain('## oRPC error report (3 calls)')
    expect(text.match(/### /g)).toHaveLength(1)
    expect(text).toContain('Same error ×3')
  })
})

describe('syntax toggles', () => {
  it('discord uses no table or details and lists issues', () => {
    const text = buildCallReport(invalidCall, discord)
    expect(text).not.toContain('| --- |')
    expect(text).not.toContain('<details>')
    expect(text).toContain('- `data[*].zip` ×2 (items 0–1): expected string, actual value ‹missing›')
    expect(text).toContain('**Response**\n```json')
  })

  it('plain text contains no Markdown syntax', () => {
    const text = buildCallReport(invalidCall, plain)
    // The *** mask is not bold
    expect(text).not.toMatch(/`|^#|\*\*[^*\s]+\*\*/m)
    expect(text).toContain('[❌ Response does not match schema] orders.list')
    expect(text).toContain('• data[*].price ×2 (items 0, 2): expected number, actual value "10", …')
    expect(text).toContain('Response:\n{')
  })

  it('line uses inline code and code blocks without a language tag', () => {
    const text = buildCallReport(invalidCall, line)
    expect(text).toContain('[❌ Response does not match schema] `orders.list`')
    expect(text).toContain('• `data[*].price` ×2 (items 0, 2): expected number')
    expect(text).toContain('Input\n```\n{')
    expect(text).toContain('Response\n```\n{')
    expect(text).not.toContain('```json')
    expect(text).not.toMatch(/^#|\*\*[^*\s]+\*\*|\| --- \||<details>/m)
  })

  it('markdown keeps the json language tag', () => {
    expect(buildCallReport(invalidCall, discord)).toContain('**Response**\n```json')
  })

  it('omits the json language tag when the tag is off', () => {
    const text = buildCallReport(invalidCall, {
      ...discord,
      syntax: { ...discord.syntax, codeBlockLang: false },
    })
    expect(text).toContain('**Response**\n```\n{')
    expect(text).not.toContain('```json')
  })

  describe('inline code with several asterisks', () => {
    const maskedCall: OrpcCall = {
      ...invalidCall,
      output: { token: 'abc' },
      issues: [
        {
          path: ['token'],
          message: 'expected number',
        },
      ],
    }

    it('line writes a masked value without backticks and keeps one-asterisk paths wrapped', () => {
      const text = buildCallReport(maskedCall, line)
      expect(text).toContain('• `token`: expected number, actual value "***"')
      expect(buildCallReport(invalidCall, line)).toContain('• `data[*].zip` ×2')
    })

    it('discord still wraps the masked value', () => {
      expect(buildCallReport(maskedCall, discord)).toContain('actual value `"***"`')
    })
  })

  it('turns off table and emoji individually, leaving other syntax as is', () => {
    const text = buildCallReport(invalidCall, {
      ...markdown,
      syntax: { ...markdown.syntax, table: false, emoji: false },
    })
    expect(text).toContain('### Response does not match schema — `orders.list`')
    expect(text).not.toContain('| --- |')
    expect(text).toContain('<details>')
  })

  it('can drop sections', () => {
    const text = buildCallReport(invalidCall, {
      ...discord,
      sections: {
        ...discord.sections,
        time: false,
        input: false,
        output: false,
      },
    })
    expect(text).not.toContain('**Time**')
    expect(text).not.toContain('**Input**')
    expect(text).not.toContain('**Response**')
  })
})

describe('omission', () => {
  it('lists the remaining count over the issue limit and attaches multiple sample values', () => {
    const text = buildCallReport(invalidCall, {
      ...discord,
      omit: { ...discord.omit, maxIssues: 1 },
    })
    expect(text).toContain('- …1 more')
    expect(text).not.toContain('data[*].price')
    const both = buildCallReport(invalidCall, {
      ...discord,
      omit: { ...discord.omit, sampleValues: 2 },
    })
    expect(both).toContain('actual value `"10"`, `"x|y"`')
  })

  it('keeps the first items of long arrays and cuts long strings', () => {
    expect(trimJson({
      list: [1, 2, 3, 4, 5],
      name: 'abcdef',
    }, 2, 3)).toEqual({
      list: [1, 2, '…3 more items'],
      name: 'abc…',
    })
  })
})

describe('length limit', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({
    ...invalidCall,
    id: String(i),
    procedure: `orders.list${i}`,
  }))

  it('degrades when over the limit and notes the unlisted calls', () => {
    const text = buildErrorsReport(many, discord)
    expect(text.length).toBeLessThanOrEqual(2000)
    expect(text).not.toContain('```json')
    expect(text).toMatch(/…\d+ more calls not listed$/)
  })

  it('truncates by line with a note when even one call does not fit', () => {
    const text = buildCallReport(invalidCall, { ...line, maxLength: 120 })
    expect(text.length).toBeLessThanOrEqual(120)
    expect(text).toContain('…(truncated')
  })

  it('stays within a limit shorter than the truncation note', () => {
    const text = buildCallReport(invalidCall, { ...line, maxLength: 10 })
    expect(text.length).toBeLessThanOrEqual(10)
  })

  it('leaves text under the limit unchanged', () => {
    const text = buildCallReport(invalidCall, discord)
    expect(text).toContain('**Input**')
    expect(text).toContain('**Response**')
  })
})

describe('template presets', () => {
  it('built-in templates match quick presets and become custom after one change', () => {
    expect(matchPreset(SYNTAX_PRESETS, discord.syntax)?.id).toBe('Discord')
    expect(matchPreset(SYNTAX_PRESETS, { ...discord.syntax, emoji: false })).toBeUndefined()
  })

  it('each built-in template matches its syntax preset', () => {
    expect([markdown, discord, line].map(options => matchPreset(SYNTAX_PRESETS, options.syntax)?.id))
      .toEqual(['Full Markdown', 'Discord', 'LINE'])
  })

  it('old saves keep the json language tag and wrap every inline code', () => {
    const { codeBlockLang: _, inlineCodeSkipStars: _s, ...oldSyntax } = markdown.syntax
    const custom = withDefaults({ ...markdown, syntax: oldSyntax as never }, markdown)
    expect(custom.syntax.codeBlockLang).toBe(true)
    expect(custom.syntax.inlineCodeSkipStars).toBe(false)
    expect(buildCallReport(invalidCall, custom)).toContain('```json')
    // An old Plain text save still matches its preset
    const { codeBlockLang: __, inlineCodeSkipStars: __s, ...oldPlain } = syntaxPreset('Plain text')
    const savedLine = withDefaults({ ...line, syntax: oldPlain as never }, line)
    expect(matchPreset(SYNTAX_PRESETS, savedLine.syntax)?.id).toBe('Plain text')
  })

  it('fills missing fields of old saves with defaults', () => {
    const merged = withDefaults({
      maxLength: 100,
      syntax: { table: false } as never,
    }, markdown)
    expect(merged.maxLength).toBe(100)
    expect(merged.syntax.table).toBe(false)
    expect(merged.syntax.heading).toBe(true)
    expect(merged.maskPattern).toBe(markdown.maskPattern)
  })
})

describe('issue messages', () => {
  const translatedCall: OrpcCall = {
    ...invalidCall,
    issues: [
      ...invalidCall.issues!.slice(0, 2).map(issue => ({ ...issue, translatedMessage: '應為字串' })),
      ...invalidCall.issues!.slice(2),
    ],
  }
  const withChoice = (issueMessage: ReportOptions['issueMessage']) => ({ ...markdown, issueMessage })

  it('defaults to the original message in every built-in template', () => {
    expect([markdown, discord, line].map(options => options.issueMessage)).toEqual(['original', 'original', 'original'])
    const text = buildCallReport(translatedCall, markdown)
    expect(text).toContain('| expected string |')
    expect(text).not.toContain('應為字串')
  })

  it('uses the translation when set to translated', () => {
    const text = buildCallReport(translatedCall, withChoice('translated'))
    expect(text).toContain('| 應為字串 |')
    expect(text).not.toContain('expected string')
  })

  it('writes the translation followed by the original when set to both', () => {
    expect(buildCallReport(translatedCall, withChoice('both'))).toContain('| 應為字串 (expected string) |')
  })

  it('keeps the original for issues without a translation under every choice', () => {
    for (const choice of ['original', 'translated', 'both'] as const) {
      expect(buildCallReport(translatedCall, withChoice(choice))).toContain('| expected number |')
      expect(buildCallReport(invalidCall, withChoice(choice))).toBe(buildCallReport(invalidCall, markdown))
    }
  })

  it('still merges duplicates by the original message', () => {
    const other = { ...invalidCall, id: '9' }
    const text = buildErrorsReport([translatedCall, other], {
      ...withChoice('translated'),
      omit: { ...markdown.omit, mergeDuplicates: true },
    })
    expect(text).toContain('Same error ×2')
  })

  it('fills the option for templates saved before it existed', () => {
    const { issueMessage: _, ...old } = withChoice('both')
    expect(withDefaults(old, markdown).issueMessage).toBe('original')
    expect(withDefaults({ ...old, issueMessage: 'both' }, markdown).issueMessage).toBe('both')
  })
})

describe('headers', () => {
  const call: OrpcCall = {
    ...invalidCall,
    requestHeaders: { 'x-request-id': 'req-1', 'authorization': 'Bearer abc', 'user-agent': 'ua' },
    responseHeaders: { 'content-type': 'application/json', 'x-powered-by': 'Nuxt', 'date': 'd' },
  }
  const withHeaders = (options: ReportOptions, headers?: Partial<ReportOptions['headers']>) => ({
    ...options,
    sections: { ...options.sections, requestHeaders: true, responseHeaders: true },
    headers: {
      ...options.headers,
      ...headers,
    },
  })

  it('built-in templates exclude headers by default', () => {
    expect(buildCallReport(call, markdown)).not.toContain('headers')
  })

  it('common scope: x-* (except x-powered-by) plus common ones, masking sensitive values', () => {
    const text = buildCallReport(call, withHeaders(markdown))
    expect(text).toContain('**Request headers**\n```\nx-request-id: req-1\nauthorization: ***\n```')
    expect(text).toContain('**Response headers**\n```\ncontent-type: application/json\n```')
    expect(text).not.toContain('user-agent')
    expect(text).not.toContain('x-powered-by')
  })

  it('all / custom list; omits the section when nothing is left', () => {
    expect(buildCallReport(call, withHeaders(markdown, { scope: 'all' }))).toContain(
      'x-powered-by: Nuxt',
    )
    const text = buildCallReport(call, withHeaders(markdown, { scope: 'list', list: 'User-Agent' }))
    expect(text).toContain('user-agent: ua')
    expect(text).not.toContain('Response headers')
  })

  it('plain text has no code block', () => {
    expect(buildCallReport(call, withHeaders(plain))).toContain(
      'Request headers:\nx-request-id: req-1',
    )
  })

  it('panel toggles override the template', () => {
    const text = buildCallReport(call, markdown, { requestHeaders: true, input: false })
    expect(text).toContain('Request headers')
    expect(text).not.toContain('**Input**')
    const success = buildCallReport({ ...call, state: 'success', issues: undefined }, markdown, {
      output: false,
    })
    expect(success).toContain('**Input**')
    expect(success).not.toContain('Response')
  })

  it('drops headers first when over the limit', () => {
    const full = buildCallReport(call, withHeaders(discord, { scope: 'all' }))
    const noHeaders = buildCallReport(call, discord)
    const text = buildCallReport(call, {
      ...withHeaders(discord, { scope: 'all' }),
      maxLength: noHeaders.length + 10,
    })
    expect(full.length).toBeGreaterThan(noHeaders.length + 10)
    expect(text).toBe(noHeaders)
  })

  it('adds default headers settings to old saves', () => {
    const merged = withDefaults({ maxLength: 1 }, markdown)
    expect(merged.headers).toEqual({ scope: 'common', list: '' })
    expect(merged.sections.requestHeaders).toBe(false)
  })
})

describe('input does not match schema', () => {
  const call: OrpcCall = {
    id: '9',
    procedure: 'orders.search',
    side: 'client',
    state: 'invalid',
    issuesOf: 'input',
    startedAt: 0,
    duration: 3,
    input: {
      keyword: 1,
      status: ['bad'],
      token: 'secret',
    },
    issues: [
      {
        path: ['keyword'],
        message: 'expected string',
        code: 'invalid_type',
      },
      {
        path: ['status', 0],
        message: 'Invalid option',
        code: 'invalid_value',
      },
    ],
    error: {
      name: 'ORPCError',
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Input validation failed',
    },
  }
  const text = buildCallReport(call, markdown)

  it('heading names Input and the request is marked not sent', () => {
    expect(text).toContain('### ❌ Input does not match schema — `orders.search`')
    expect(text).toContain('- **Request**: orders.search (not sent · Client)')
  })

  it('takes actual values from Input, still masked', () => {
    expect(text).toContain('| `keyword` | `invalid_type` | expected string | `1` |')
    expect(text).toContain('| `status[0]` | `invalid_value` | Invalid option | `"bad"` |')
    expect(text).toContain('"token": "***"')
    expect(text).not.toContain('<summary>Response')
  })

  it('lists the issue code in list syntax', () => {
    expect(buildCallReport(call, discord)).toContain('- `keyword` (`invalid_type`): expected string, actual value `1`')
    expect(buildCallReport(call, plain)).toContain('• keyword (invalid_type): expected string, actual value 1')
  })

  it('does not merge with a same-named response issue', () => {
    const output = { ...call, id: '10', issuesOf: 'output' as const }
    expect(buildErrorsReport([call, output], markdown)).not.toContain('Same error')
  })
})

describe('input rejected by the server', () => {
  const issues = [
    {
      path: ['name'],
      message: 'Too small: expected string to have >=2 characters',
      code: 'too_small',
      origin: 'string',
      minimum: 2,
      inclusive: true,
    },
  ]
  const call: OrpcCall = {
    id: '20',
    procedure: 'profile.update',
    method: 'POST',
    url: 'http://localhost:3102/rpc/profile/update',
    status: 400,
    side: 'client',
    state: 'invalid',
    issuesOf: 'input',
    issuesSource: 'server',
    startedAt: 0,
    duration: 12,
    input: { name: 'A', email: 'a@b.c' },
    issues,
    error: {
      name: 'ORPCError',
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Input validation failed',
      data: { issues },
    },
  }

  it.each(builtinTemplates().map(template => [template.id, template.options] as const))('%s: issues rows with code and no not sent', (_, options) => {
    const text = buildCallReport(call, options)
    expect(text).toContain('Input rejected by server schema')
    expect(text).toMatch(/name.*too_small.*Too small: expected string to have >=2 characters.*"A"/)
    expect(text).toContain('POST http://localhost:3102/rpc/profile/update → 400 (Client)')
    expect(text).not.toContain('not sent')
    expect(text).not.toContain('**ORPCError · BAD_REQUEST**')
  })

  it('markdown: table row with code and the raw error data kept', () => {
    const text = buildCallReport(call, markdown)
    expect(text).toContain('| `name` | `too_small` | Too small: expected string to have >=2 characters | `"A"` |')
    expect(text).toContain('<summary>Error data</summary>')
  })

  it('discord: keeps the issues rows under 2000 characters after dropping error data', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      ...issues[0]!,
      path: ['tags', i, 'label'],
      message: `Too small: expected string to have >=${i + 2} characters`,
    }))
    const big = {
      ...call,
      input: {
        name: 'A',
        blob: 'x'.repeat(3000),
      },
      issues: [issues[0]!, ...many],
      error: {
        ...call.error!,
        data: {
          issues: [issues[0]!, ...many],
        },
      },
    }
    const text = buildCallReport(big, discord)
    expect(text.length).toBeLessThanOrEqual(2000)
    expect(text).toContain('- `name` (`too_small`): Too small: expected string to have >=2 characters')
    expect(text).not.toContain('Error data')
  })

  it('uses the translation when the template says translated', () => {
    const translated = {
      ...call,
      issues: [
        { ...issues[0]!, translatedMessage: '數值過小：預期 string 應為 >=2 字元' },
      ],
    }
    expect(buildCallReport(translated, { ...markdown, issueMessage: 'translated' })).toContain('| `name` | `too_small` | 數值過小：預期 string 應為 >=2 字元 |')
  })

  it('a custom template saved in the current storage format produces the issues section', () => {
    const saved = JSON.parse(JSON.stringify({
      ...markdown,
      syntax: { ...markdown.syntax, table: false },
    }))
    const text = buildCallReport(call, withDefaults(saved, markdown))
    expect(text).toContain('- `name` (`too_small`): Too small: expected string to have >=2 characters, actual value `"A"`')
  })

  it('does not merge with a client rejection of the same input', () => {
    const client = {
      ...call,
      id: '21',
      issuesSource: undefined,
      status: 400,
    }
    expect(buildErrorsReport([call, client], markdown)).not.toContain('Same error')
  })
})
