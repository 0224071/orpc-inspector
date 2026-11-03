import { describe, expect, it } from 'vitest'
import { isSensitiveKey, MASK, maskSensitive } from '../../src/core/mask'

describe('default mask pattern', () => {
  it.each([
    'password',
    'token',
    'cookie',
    'authorization',
    'Authorization',
    'x-api-key',
    'x-auth-token',
    'session-id',
    'session_id',
    'sessionId',
    'SESSIONID',
    'x-session-id',
    'X-Session-Id',
    'x_session_id',
    'app.session-id',
  ])('masks %s', (key) => {
    expect(isSensitiveKey(key)).toBe(true)
  })

  it.each([
    'session',
    'sessionStart',
    'sessionCount',
    'sessionIdleTimeout',
    'session-ids-count',
    'possession_id',
    'x-trace',
    'content-type',
    'x-authorization-hint',
  ])('does not mask %s', (key) => {
    expect(isSensitiveKey(key)).toBe(false)
  })

  it('masks nested objects and arrays without touching ordinary fields', () => {
    expect(maskSensitive({
      password: 'x',
      author: 'Paul',
      headers: { 'x-session-id': 'EEE', 'x-trace': 't' },
      nested: [
        { Authorization: 'Bearer y' },
      ],
    })).toEqual({
      password: MASK,
      author: 'Paul',
      headers: { 'x-session-id': MASK, 'x-trace': 't' },
      nested: [
        { Authorization: MASK },
      ],
    })
  })
})

describe('custom mask pattern', () => {
  it('supports custom patterns; empty disables masking; invalid falls back to default', () => {
    expect(maskSensitive({ idNo: 'A1', password: 'x' }, '^idNo$')).toEqual({
      idNo: MASK,
      password: 'x',
    })
    expect(maskSensitive({ password: 'x' }, '')).toEqual({ password: 'x' })
    expect(maskSensitive({ password: 'x' }, '(')).toEqual({ password: MASK })
  })
})
