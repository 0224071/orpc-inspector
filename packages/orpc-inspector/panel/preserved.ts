import type { OrpcCall, OrpcCallBodyField } from '../src/core/types'
import { RECORD_LIMIT } from '../src/client/preserve-log'

/** Sizes are JSON characters, shown in KB / MB like bytes */
export function formatSize(chars: number): string {
  const kb = chars / 1024
  return kb < 1024
    ? `${Math.max(1, Math.round(kb))} KB`
    : `${(kb / 1024).toFixed(1)} MB`
}

export const RECORD_LIMIT_TEXT = formatSize(RECORD_LIMIT)

/** Size of the record when the field was left out of a Preserve log summary; undefined when the field is there */
export function notPreservedSize(call: OrpcCall, field: OrpcCallBodyField): string | undefined {
  return call.notPreserved?.fields.includes(field)
    ? formatSize(call.notPreserved.size)
    : undefined
}

/** Error data stands in for the response on errors and server-rejected input, as in the response view */
export function responseField(call: OrpcCall): OrpcCallBodyField {
  return call.state === 'error' || call.issuesSource === 'server'
    ? 'error.data'
    : 'output'
}
