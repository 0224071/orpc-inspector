import { ORPCError as V1ORPCError } from '@orpc/client'
import { ORPCError } from '@orpc/client-v2'
import { ValidationError } from '@orpc/contract-v2'
import { describe, expect, it } from 'vitest'
import { classifyError } from '../../src/core/classify-error'

// The orpc-v2 project aliases bare @orpc/* to the v2 install, so the core sees the same classes as the tests
describe('orpc-v2 test project', () => {
  it('resolves the core\'s @orpc imports to v2', () => {
    expect(V1ORPCError).toBe(ORPCError)
    const error = new ORPCError('BAD_REQUEST', {
      cause: new ValidationError({
        message: 'm',
        issues: [
          {
            message: 'bad',
            path: ['a'],
          },
        ],
        invalidData: {},
      }),
    })
    expect(classifyError(error)).toMatchObject({
      state: 'invalid',
      issuesOf: 'input',
    })
  })
})
