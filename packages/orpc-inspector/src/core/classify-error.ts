import type { OrpcCall, OrpcCallError, OrpcCallIssue } from './types'
import { ORPCError } from '@orpc/client'
import { ValidationError } from '@orpc/contract'
import { toHeaderRecord } from './headers'
import { ISSUE_PARAM_KEYS } from './types'

/** Converts to plain data that can be structured-cloned / serialized into the payload */
export function toPlain(value: unknown): unknown {
  if (value === undefined) {
    return undefined
  }
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === 'bigint') {
          return `${v}n`
        }
        if (typeof Blob !== 'undefined' && v instanceof Blob) {
          return `[${v.constructor.name} ${v.size} bytes]`
        }
        return v
      }),
    )
  }
  catch {
    // String() also throws, e.g. for null-prototype objects; recording must never throw
    try {
      return String(value)
    }
    catch {
      return '[unserializable value]'
    }
  }
}

/** Keeps zod issue parameters that are present and survive serialization */
function issueParams(issue: object): Partial<OrpcCallIssue> {
  const params: Record<string, unknown> = {}
  for (const key of ISSUE_PARAM_KEYS) {
    const value = toPlain((issue as Record<string, unknown>)[key])
    if (value !== undefined && value !== null) {
      params[key] = value
    }
  }
  return params
}

type PathSegment = PropertyKey | { key: PropertyKey }

interface IssueLike {
  message: string
  path?: readonly PathSegment[]
}

function toIssues(issues: readonly IssueLike[]): OrpcCallIssue[] {
  return issues.map(issue => ({
    ...issueParams(issue),
    path: (issue.path ?? []).map((segment) => {
      const key = typeof segment === 'object'
        ? segment.key
        : segment
      return typeof key === 'number'
        ? key
        : String(key)
    }),
    message: issue.message,
    code: (issue as { code?: string }).code,
  }))
}

function isPathSegment(segment: unknown) {
  if (typeof segment === 'string' || typeof segment === 'number') {
    return true
  }
  return !!segment && typeof segment === 'object' && 'key' in segment
    && (typeof segment.key === 'string' || typeof segment.key === 'number')
}

/** Standard Schema issues sent by the server in an oRPC `BAD_REQUEST`'s `data.issues`; undefined for any other shape */
function serverIssues(error: ORPCError<string, unknown>): IssueLike[] | undefined {
  if (error.code !== 'BAD_REQUEST' || !error.data || typeof error.data !== 'object') {
    return undefined
  }
  const { issues } = error.data as { issues?: unknown }
  if (!Array.isArray(issues) || issues.length === 0) {
    return undefined
  }
  const valid = issues.every(issue =>
    !!issue && typeof issue === 'object'
    && typeof issue.message === 'string'
    && Array.isArray(issue.path)
    && issue.path.every(isPathSegment),
  )
  return valid
    ? issues as IssueLike[]
    : undefined
}

/** When the backend returns a non-oRPC error, data carries the raw response headers */
function maskDataHeaders(data: unknown): unknown {
  if (!data || typeof data !== 'object' || !('headers' in data)) {
    return data
  }
  const { headers } = data
  if (!headers || typeof headers !== 'object') {
    return data
  }
  return {
    ...data,
    headers: toHeaderRecord(headers as Record<string, string | string[]>, true),
  }
}

function toCallError(error: unknown, mask: boolean): OrpcCallError {
  if (error instanceof ORPCError) {
    const data = toPlain(error.data)
    return {
      name: 'ORPCError',
      message: error.message,
      code: error.code,
      status: error.status,
      data: mask
        ? maskDataHeaders(data)
        : data,
    }
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  return {
    name: 'Error',
    message: String(error),
  }
}

type ErrorFields = Pick<OrpcCall, 'state' | 'issuesOf' | 'issuesSource' | 'issues' | 'output' | 'error'>

/**
 * - ResponseValidationPlugin: throws ValidationError directly
 * - RequestValidationPlugin: throws ORPCError (BAD_REQUEST) with a ValidationError cause; no request is sent
 * - A 4xx from the backend comes back over HTTP; its cause is never a ValidationError. oRPC's server input
 *   validation sends `BAD_REQUEST` with Standard Schema issues in `data.issues`, recorded as server input issues
 *
 * mask: SSR records go into the HTML payload, so headers in error.data must be masked at record time
 */
export function classifyError(error: unknown, mask = false): ErrorFields {
  if (error instanceof ValidationError) {
    return {
      state: 'invalid',
      issuesOf: 'output',
      output: toPlain(error.data),
      issues: toIssues(error.issues),
      error: toCallError(error, mask),
    }
  }
  if (error instanceof ORPCError && error.cause instanceof ValidationError) {
    return {
      state: 'invalid',
      issuesOf: 'input',
      issues: toIssues(error.cause.issues),
      error: toCallError(error, mask),
    }
  }
  const issues = error instanceof ORPCError
    ? serverIssues(error)
    : undefined
  if (issues) {
    return {
      state: 'invalid',
      issuesOf: 'input',
      issuesSource: 'server',
      issues: toIssues(issues),
      error: toCallError(error, mask),
    }
  }
  return {
    state: 'error',
    error: toCallError(error, mask),
  }
}
