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
