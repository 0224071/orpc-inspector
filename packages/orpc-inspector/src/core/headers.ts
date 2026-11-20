import type { OrpcHeaders } from './types'
import { isSensitiveKey, MASK } from './mask'

/**
 * Converts oRPC's StandardHeaders into a serializable record, dropping undefined.
 * SSR records go into the HTML payload, so mask at record time.
 */
export function toHeaderRecord(
  headers: Record<string, string | string[] | undefined>,
  mask = false,
): OrpcHeaders {
  const record: OrpcHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue
    }
    record[name] = mask && isSensitiveKey(name)
      ? MASK
      : Array.isArray(value)
        ? [...value]
        : value
  }
  return record
}

/** When the backend returns a non-oRPC error, data carries the raw response headers */
export function maskDataHeaders(data: unknown): unknown {
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
