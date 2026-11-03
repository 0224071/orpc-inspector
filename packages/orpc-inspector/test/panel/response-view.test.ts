import type { OrpcCall } from '../../src/core/types'
import { describe, expect, it } from 'vitest'
import { responseView } from '../../panel/response-view'

const base: OrpcCall = {
  id: '1',
  procedure: 'profile.update',
  side: 'client',
  state: 'success',
  startedAt: 0,
  attempts: [],
} as unknown as OrpcCall
const data = {
  body: { message: 'Invalid' },
  status: 400,
  headers: { authorization: 'Bearer x' },
}

describe('responseView', () => {
  it('shows the error data of a failed call', () => {
    const call = {
      ...base,
      state: 'error',
      error: { name: 'ORPCError', message: 'Bad Request', data },
    } as OrpcCall
    expect(responseView(call)).toEqual({ value: data, errorData: true })
  })

  it('shows the error data of a server validation failure', () => {
    const issues = { issues: [] }
    const call = {
      ...base,
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      error: { name: 'ORPCError', message: 'Input validation failed', data: issues },
    } as OrpcCall
    expect(responseView(call)).toEqual({ value: issues, errorData: true })
  })

  it('shows the output of a successful call', () => {
    const call = {
      ...base,
      output: {
        headers: { authorization: 'x' },
      },
    } as OrpcCall
    expect(responseView(call)).toEqual({
      value: {
        headers: { authorization: 'x' },
      },
      errorData: false,
    })
  })

  it('shows the output of a client output validation failure', () => {
    const call = {
      ...base,
      state: 'invalid',
      issuesOf: 'output',
      output: { name: 'X' },
    } as OrpcCall
    expect(responseView(call)).toEqual({
      value: { name: 'X' },
      errorData: false,
    })
  })
})
