import type { OrpcCall } from '../src/core/types'

/** Validation failures show the actual response; other errors and server-rejected input show the error data */
export function responseView(call: OrpcCall): { value: unknown, errorData: boolean } {
  const errorData = call.state === 'error' || call.issuesSource === 'server'
  return {
    value: errorData
      ? call.error?.data
      : call.output,
    errorData,
  }
}
