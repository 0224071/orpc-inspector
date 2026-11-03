import { ORPCError } from '@orpc/client'
import { ValidationError } from '@orpc/contract'
import { describe, expect, it } from 'vitest'
import { classifyError } from '../../src/core/classify-error'
import { toHeaderRecord } from '../../src/core/headers'

describe('toHeaderRecord', () => {
  const headers = {
    'x-request-id': 'req-123',
    'authorization': 'Bearer abc',
    'set-cookie': ['a=1', 'b=2'],
    'x-empty': undefined,
  }

  it('drops undefined and copies arrays', () => {
    const record = toHeaderRecord(headers)
    expect(record).toEqual({
      'x-request-id': 'req-123',
      'authorization': 'Bearer abc',
      'set-cookie': ['a=1', 'b=2'],
    })
    expect(record['set-cookie']).not.toBe(headers['set-cookie'])
  })

  it('masks sensitive headers when recording on SSR', () => {
    expect(toHeaderRecord(headers, true)).toEqual({
      'x-request-id': 'req-123',
      'authorization': '***',
      'set-cookie': '***',
    })
  })
})

describe('classifyError', () => {
  const issues = [
    {
      path: ['status', 0],
      message: 'Invalid option',
    },
  ]

  it('responseValidationPlugin: response does not match schema', () => {
    const error = new ValidationError({
      message: 'output',
      issues,
      data: {
        status: ['x'],
      },
    })
    expect(classifyError(error)).toMatchObject({
      state: 'invalid',
      issuesOf: 'output',
      output: {
        status: ['x'],
      },
      issues: [
        {
          path: ['status', 0],
          message: 'Invalid option',
        },
      ],
    })
  })

  it('requestValidationPlugin: input does not match schema, no output recorded', () => {
    const error = new ORPCError('BAD_REQUEST', {
      message: 'Input validation failed',
      data: { issues },
      cause: new ValidationError({ message: 'input', issues, data: {} }),
    })
    const fields = classifyError(error)
    expect(fields).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
      issues: [
        {
          path: ['status', 0],
          message: 'Invalid option',
        },
      ],
      error: { name: 'ORPCError', code: 'BAD_REQUEST', status: 400 },
    })
    expect(fields.output).toBeUndefined()
  })

  it('records a backend 400 with Standard Schema issues as server input issues', () => {
    const error = new ORPCError('BAD_REQUEST', {
      data: { issues },
    })
    expect(classifyError(error)).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      issues: [
        {
          path: ['status', 0],
          message: 'Invalid option',
        },
      ],
      error: {
        code: 'BAD_REQUEST',
        data: { issues },
      },
    })
    expect(classifyError(new TypeError('Failed to fetch'))).toEqual({
      state: 'error',
      error: { name: 'TypeError', message: 'Failed to fetch' },
    })
  })

  it('masks response headers in error.data when recording on SSR', () => {
    const error = new ORPCError('NOT_FOUND', {
      data: {
        status: 404,
        body: {},
        headers: { 'set-cookie': 'sid=1', 'etag': 'W/"2"' },
      },
    })
    expect(classifyError(error).error?.data).toMatchObject({
      headers: { 'set-cookie': 'sid=1' },
    })
    expect(classifyError(error, true).error?.data).toEqual({
      status: 404,
      body: {},
      headers: { 'set-cookie': '***', 'etag': 'W/"2"' },
    })
  })
})

describe('issue parameters', () => {
  const classify = (issue: object) => {
    const error = new ValidationError({
      message: 'output',
      issues: [
        {
          path: ['name'],
          message: 'm',
          ...issue,
        },
      ],
      data: {},
    })
    return classifyError(error).issues![0]
  }

  it('keeps too_small parameters', () => {
    expect(classify({
      code: 'too_small',
      origin: 'string',
      minimum: 3,
      inclusive: true,
    })).toEqual({
      path: ['name'],
      message: 'm',
      code: 'too_small',
      origin: 'string',
      minimum: 3,
      inclusive: true,
    })
  })

  it('keeps enum values', () => {
    expect(classify({
      code: 'invalid_value',
      values: ['a', 'b'],
    })).toMatchObject({
      values: ['a', 'b'],
    })
  })

  it('keeps the regex pattern as a string', () => {
    expect(classify({ code: 'invalid_format', format: 'regex', pattern: '/^\d+$/' })).toMatchObject({
      format: 'regex',
      pattern: '/^\d+$/',
    })
  })

  it('stores bigint bounds as strings', () => {
    expect(classify({ code: 'too_small', origin: 'bigint', minimum: 10n })).toMatchObject({ minimum: '10n' })
  })

  it('adds no parameter fields for plain issues', () => {
    expect(classify({})).toEqual({
      path: ['name'],
      message: 'm',
      code: undefined,
    })
  })

  it('drops other issue fields', () => {
    const issue = classify({
      code: 'custom',
      input: 'secret',
      params: { a: 1 },
      continue: true,
    })
    expect(issue).not.toHaveProperty('input')
    expect(issue).not.toHaveProperty('params')
    expect(issue).not.toHaveProperty('continue')
  })
})

describe('server input validation errors', () => {
  // Payload measured from oRPC 1.16.1 + zod 4.6.7 over RPCLink
  const measured = {
    issues: [
      {
        origin: 'string',
        code: 'too_small',
        minimum: 2,
        inclusive: true,
        path: ['name'],
        message: 'Too small: expected string to have >=2 characters',
      },
      {
        origin: 'string',
        code: 'invalid_format',
        format: 'email',
        pattern: '/^[^@]+@[^@]+$/',
        path: ['email'],
        message: 'Invalid email address',
      },
      {
        code: 'invalid_value',
        values: ['a', 'b'],
        path: ['kind'],
        message: 'Invalid option: expected one of "a"|"b"',
      },
      {
        origin: 'bigint',
        code: 'too_small',
        minimum: 10n,
        inclusive: true,
        path: ['count'],
        message: 'Too small: expected bigint to be >=10',
      },
    ],
  }
  const server = (data: unknown, code = 'BAD_REQUEST', message = 'Input validation failed') =>
    classifyError(new ORPCError(code, { message, data }))

  it('records the measured 400 payload with its parameters', () => {
    const fields = server(measured)
    expect(fields).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      error: {
        name: 'ORPCError',
        code: 'BAD_REQUEST',
        status: 400,
        message: 'Input validation failed',
      },
    })
    expect(fields.issues).toEqual([
      {
        path: ['name'],
        message: 'Too small: expected string to have >=2 characters',
        code: 'too_small',
        origin: 'string',
        minimum: 2,
        inclusive: true,
      },
      {
        path: ['email'],
        message: 'Invalid email address',
        code: 'invalid_format',
        origin: 'string',
        format: 'email',
        pattern: '/^[^@]+@[^@]+$/',
      },
      {
        path: ['kind'],
        message: 'Invalid option: expected one of "a"|"b"',
        code: 'invalid_value',
        values: ['a', 'b'],
      },
      {
        path: ['count'],
        message: 'Too small: expected bigint to be >=10',
        code: 'too_small',
        origin: 'bigint',
        minimum: '10n',
        inclusive: true,
      },
    ])
    expect(fields.output).toBeUndefined()
  })

  it('flattens { key } path segments', () => {
    expect(server({
      issues: [
        {
          path: [
            { key: 'items' },
            { key: 0 },
            'sku',
          ],
          message: 'm',
        },
      ],
    }).issues).toEqual([
      {
        path: ['items', 0, 'sku'],
        message: 'm',
        code: undefined,
      },
    ])
  })

  it('keeps a custom check message', () => {
    expect(server({
      issues: [
        {
          code: 'too_small',
          minimum: 3,
          path: ['name'],
          message: 'custom msg',
        },
      ],
    }).issues![0])
      .toMatchObject({ message: 'custom msg', code: 'too_small', minimum: 3 })
  })

  it('ignores a rewritten error message', () => {
    expect(server(measured, 'BAD_REQUEST', 'Please check the form')).toMatchObject({
      state: 'invalid',
      issuesSource: 'server',
    })
  })

  it('keeps issues in another shape as a plain error', () => {
    const fields = server({
      issues: ['name is required'],
    })
    expect(fields).toMatchObject({
      state: 'error',
      error: {
        data: {
          issues: ['name is required'],
        },
      },
    })
    expect(fields.issues).toBeUndefined()
    expect(server({ issues: [] }).state).toBe('error')
    expect(server({
      issues: [
        { field: 'name', error: 'required' },
      ],
    }).state).toBe('error')
    expect(server({
      issues: [
        {
          message: 'm',
          path: [{}],
        },
      ],
    }).state).toBe('error')
  })

  it('keeps other codes as plain errors', () => {
    const fields = server(measured, 'CONFLICT')
    expect(fields.state).toBe('error')
    expect(fields.issues).toBeUndefined()
  })

  it('keeps server output validation failures as plain errors', () => {
    expect(server(undefined, 'INTERNAL_SERVER_ERROR', 'Output validation failed').state).toBe('error')
  })

  it('keeps client-detected input issues as client', () => {
    const fields = classifyError(new ORPCError('BAD_REQUEST', {
      data: measured,
      cause: new ValidationError({ message: 'input', issues: measured.issues, data: {} }),
    }))
    expect(fields.issuesSource).toBeUndefined()
  })
})
