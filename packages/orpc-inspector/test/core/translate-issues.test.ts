import type { IssueTranslator } from '../../src/core/translate-issues'
import type { OrpcCall, OrpcCallIssue } from '../../src/core/types'
import { describe, expect, it } from 'vitest'
import { translateCall } from '../../src/core/translate-issues'

function received(input: unknown): string {
  if (input === null) {
    return 'null'
  }
  if (Array.isArray(input)) {
    return 'array'
  }
  return typeof input
}

type Issue = Record<string, any>

/** Small stand-ins for zod's `en`, `ja` and `zh-TW` locales */
function en(issue: Issue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return `Invalid input: expected ${issue.expected}, received ${received(issue.input)}`
    case 'too_small':
      return `Too small: expected ${issue.origin} to have ${issue.inclusive ? '>=' : '>'}${issue.minimum} characters`
    default:
      return undefined
  }
}

function ja(issue: Issue): string | undefined {
  return issue.code === 'invalid_type'
    ? `無効な入力: ${issue.expected}が期待されましたが、${received(issue.input)}が入力されました`
    : undefined
}

function zhTW(issue: Issue): string | undefined {
  switch (issue.code) {
    case 'invalid_type':
      return `無效的輸入值：預期為 ${issue.expected}，但收到 ${received(issue.input)}`
    case 'too_small':
      return `數值過小：預期 ${issue.origin} 應為 ${issue.inclusive ? '>=' : '>'}${issue.minimum} 字元`
    default:
      return undefined
  }
}

function translator(config: IssueTranslator['config'] = { localeError: en }, target: IssueTranslator['target'] = zhTW): IssueTranslator {
  return { target, config }
}

function makeCall(issues: OrpcCallIssue[], patch: Partial<OrpcCall> = {}): OrpcCall {
  return {
    id: '1',
    procedure: 'profile.get',
    side: 'client',
    state: 'invalid',
    startedAt: 0,
    issuesOf: 'output',
    issues,
    ...patch,
  }
}

const translatedOf = (call: OrpcCall) => call.issues!.map(issue => issue.translatedMessage)

describe('translateCall', () => {
  it('translates a default message at a nested output path', () => {
    const call = makeCall([
      {
        path: ['user', 'age'],
        message: 'Invalid input: expected number, received string',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      output: {
        user: { age: '12' },
      },
    })

    const result = translateCall(call, translator())
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 number，但收到 string'])
    expect(result.issues![0]!.message).toBe('Invalid input: expected number, received string')
    expect(call.issues![0]).not.toHaveProperty('translatedMessage')
  })

  it('reads input issues from the recorded input', () => {
    const call = makeCall([
      {
        path: ['n'],
        message: 'Invalid input: expected number, received boolean',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      issuesOf: 'input',
      input: { n: true },
      output: { n: 'x' },
    })

    expect(translatedOf(translateCall(call, translator()))).toEqual(['無效的輸入值：預期為 number，但收到 boolean'])
  })

  it('treats a missing path as undefined', () => {
    const call = makeCall([
      {
        path: ['user', 'name'],
        message: 'Invalid input: expected string, received undefined',
        code: 'invalid_type',
        expected: 'string',
      },
    ], { output: {} })

    expect(translatedOf(translateCall(call, translator()))).toEqual(['無效的輸入值：預期為 string，但收到 undefined'])
  })

  it('prefers the issue\'s own input', () => {
    const issue = {
      path: ['n'],
      message: 'Invalid input: expected number, received boolean',
      code: 'invalid_type',
      expected: 'number',
      input: true,
    } as OrpcCallIssue
    const call = makeCall([issue], {
      output: { n: 'x' },
    })

    expect(translatedOf(translateCall(call, translator()))).toEqual(['無效的輸入值：預期為 number，但收到 boolean'])
  })

  it('translates parameter-based messages', () => {
    const call = makeCall([
      {
        path: ['name'],
        message: 'Too small: expected string to have >=3 characters',
        code: 'too_small',
        origin: 'string',
        minimum: 3,
        inclusive: true,
      },
    ], {
      output: { name: 'ab' },
    })

    expect(translatedOf(translateCall(call, translator()))).toEqual(['數值過小：預期 string 應為 >=3 字元'])
  })

  it('keeps custom messages', () => {
    const call = makeCall([
      {
        path: ['name'],
        message: 'Name is required',
        code: 'invalid_type',
        expected: 'string',
      },
    ], { output: {} })

    const result = translateCall(call, translator())
    expect(result).toBe(call)
  })

  it('keeps messages when the app sets a global customError', () => {
    const call = makeCall([
      {
        path: ['name'],
        message: 'Invalid input: expected string, received undefined',
        code: 'invalid_type',
        expected: 'string',
      },
    ], { output: {} })

    const result = translateCall(call, translator({
      customError: () => ({ message: 'Custom' }),
      localeError: en,
    }))
    expect(result).toBe(call)
  })

  it('ignores a customError that returns nothing', () => {
    const call = makeCall([
      {
        path: ['name'],
        message: 'Invalid input: expected string, received undefined',
        code: 'invalid_type',
        expected: 'string',
      },
    ], { output: {} })

    const result = translateCall(call, translator({
      customError: () => undefined,
      localeError: en,
    }))
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 string，但收到 undefined'])
  })

  it('unwraps { message } results', () => {
    const call = makeCall([
      {
        path: ['name'],
        message: 'Invalid input: expected string, received undefined',
        code: 'invalid_type',
        expected: 'string',
      },
    ], { output: {} })

    const result = translateCall(call, translator(
      {
        localeError: issue => ({
          message: en(issue),
        }),
      },
      issue => ({
        message: zhTW(issue),
      }),
    ))
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 string，但收到 undefined'])
  })

  it('falls back to "Invalid input" without a localeError', () => {
    const call = makeCall([
      {
        path: [],
        message: 'Invalid input',
        code: 'custom',
      },
    ])

    const result = translateCall(call, translator({}, () => '無效的輸入值'))
    expect(translatedOf(result)).toEqual(['無效的輸入值'])
  })

  it('uses zod en as the baseline before the app loads zod', () => {
    // SSR records are translated when the page script starts, before the app's own `import 'zod'` sets localeError
    const call = makeCall([
      {
        expected: 'string',
        path: ['name'],
        message: 'Invalid input: expected string, received undefined',
        code: 'invalid_type',
      },
      {
        path: ['mobile'],
        message: 'Mobile must start with 09',
        code: 'invalid_format',
      },
    ])

    const result = translateCall(call, {
      ...translator({}),
      english: en,
    })
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 string，但收到 undefined', undefined])
  })

  it('does not use en once the app has a localeError', () => {
    const call = makeCall([
      {
        expected: 'string',
        path: ['name'],
        message: 'Invalid input: expected string, received undefined',
        code: 'invalid_type',
      },
    ])

    const result = translateCall(call, {
      ...translator({ localeError: ja }),
      english: en,
    })
    expect(translatedOf(result)).toEqual([undefined])
  })

  it('keeps the original when serialization changed the received type', () => {
    // A Date became a string in the record
    const call = makeCall([
      {
        path: ['at'],
        message: 'Invalid input: expected number, received object',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      output: { at: '2026-10-31T00:00:00.000Z' },
    })

    expect(translateCall(call, translator())).toBe(call)
  })

  it('keeps non-zod issues', () => {
    const call = makeCall([
      {
        path: ['name'],
        message: 'Invalid input',
      },
    ])

    expect(translateCall(call, translator({}, () => '無效的輸入值'))).toBe(call)
  })

  it('translates from an app already using another locale', () => {
    const call = makeCall([
      {
        path: ['n'],
        message: '無効な入力: numberが期待されましたが、stringが入力されました',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      output: { n: 'x' },
    })

    const result = translateCall(call, translator({ localeError: ja }))
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 number，但收到 string'])
  })

  it('skips translations identical to the original', () => {
    const call = makeCall([
      {
        path: ['n'],
        message: 'Invalid input: expected number, received string',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      output: { n: 'x' },
    })

    expect(translateCall(call, translator({ localeError: en }, en))).toBe(call)
  })

  it('keeps the original when a locale throws', () => {
    const call = makeCall([
      {
        path: ['n'],
        message: 'Invalid input: expected number, received string',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      output: { n: 'x' },
    })

    const result = translateCall(call, translator({ localeError: en }, () => {
      throw new Error('boom')
    }))
    expect(result).toBe(call)
  })

  it('translates only the issues that qualify', () => {
    const call = makeCall([
      {
        path: ['a'],
        message: 'Invalid input: expected number, received string',
        code: 'invalid_type',
        expected: 'number',
      },
      {
        path: ['b'],
        message: 'Must be a number',
        code: 'invalid_type',
        expected: 'number',
      },
    ], {
      output: { a: 'x', b: 'y' },
    })

    expect(translatedOf(translateCall(call, translator()))).toEqual(['無效的輸入值：預期為 number，但收到 string', undefined])
  })

  it('returns calls without issues unchanged', () => {
    const call = makeCall([])
    expect(translateCall(call, translator())).toBe(call)
    const success = {
      ...makeCall([]),
      issues: undefined,
    }
    expect(translateCall(success, translator())).toBe(success)
  })
})

describe('translateCall: server-reported issues', () => {
  const tooShort = {
    path: ['name'],
    message: 'Too small: expected string to have >=2 characters',
    code: 'too_small',
    origin: 'string',
    minimum: 2,
    inclusive: true,
  }
  const server = (issues: OrpcCallIssue[], input: unknown) =>
    makeCall(issues, {
      issuesOf: 'input',
      issuesSource: 'server',
      input,
      status: 400,
    })

  it('translates a server too_small to zh-TW', () => {
    const result = translateCall(server([tooShort], { name: 'A' }), {
      ...translator(),
      english: en,
    })
    expect(translatedOf(result)).toEqual(['數值過小：預期 string 應為 >=2 字元'])
    expect(result.issues![0]!.message).toBe(tooShort.message)
  })

  it('translates a server English message while the app uses ja', () => {
    const result = translateCall(server([tooShort], { name: 'A' }), {
      ...translator({ localeError: ja }),
      english: en,
    })
    expect(translatedOf(result)).toEqual(['數值過小：預期 string 應為 >=2 字元'])
  })

  it('translates a server message equal to the app locale message', () => {
    const issue = {
      path: ['n'],
      message: '無効な入力: numberが期待されましたが、stringが入力されました',
      code: 'invalid_type',
      expected: 'number',
    }
    const result = translateCall(server([issue], { n: 'x' }), {
      ...translator({ localeError: ja }),
      english: en,
    })
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 number，但收到 string'])
  })

  it('ignores the app customError for server issues', () => {
    const result = translateCall(server([tooShort], { name: 'A' }), {
      ...translator({
        localeError: en,
        customError: () => 'app custom',
      }),
      english: en,
    })
    expect(translatedOf(result)).toEqual(['數值過小：預期 string 應為 >=2 字元'])
  })

  it('keeps a server custom message', () => {
    const result = translateCall(server([
      { ...tooShort, message: 'custom msg' },
    ], { name: 'A' }), {
      ...translator(),
      english: en,
    })
    expect(translatedOf(result)).toEqual([undefined])
  })

  it('translates a server type error from the recorded input', () => {
    const issue = {
      path: ['age'],
      message: 'Invalid input: expected number, received string',
      code: 'invalid_type',
      expected: 'number',
    }
    const result = translateCall(server([issue], { age: '1' }), {
      ...translator(),
      english: en,
    })
    expect(translatedOf(result)).toEqual(['無效的輸入值：預期為 number，但收到 string'])
  })

  it('keeps the original when the recorded input type differs from what the server validated', () => {
    const issue = {
      path: ['age'],
      message: 'Invalid input: expected number, received string',
      code: 'invalid_type',
      expected: 'number',
    }
    const result = translateCall(server([issue], { age: true }), {
      ...translator(),
      english: en,
    })
    expect(translatedOf(result)).toEqual([undefined])
  })

  it('keeps a server issue without code', () => {
    const result = translateCall(server([
      {
        path: ['name'],
        message: 'Expected string',
      },
    ], { name: 1 }), {
      ...translator(),
      english: en,
    })
    expect(translatedOf(result)).toEqual([undefined])
  })
})
