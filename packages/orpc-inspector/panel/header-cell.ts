import { isSensitiveKey, MASK } from '../src/core/mask'

/**
 * How a header value is shown:
 * - `recorded-mask`: masked at record time (SSR, or opted-in production builds), nothing to reveal
 * - `revealable`: sensitive value kept in the record, masked on display
 * - `plain`: shown as is
 */
export type HeaderCell = 'recorded-mask' | 'revealable' | 'plain'

export function headerCell(name: string, value: string, maskPattern: string, revealed: boolean): HeaderCell {
  if (value === MASK) {
    return 'recorded-mask'
  }
  if (!revealed && isSensitiveKey(name, maskPattern)) {
    return 'revealable'
  }
  return 'plain'
}

/**
 * Error data from a non-oRPC backend carries the raw response headers as `data.headers`
 * (see `maskDataHeaders` in classify-error); shows them like the Headers section.
 * `path` is relative to the error data; undefined means not a sensitive header.
 */
export function dataHeaderCell(path: (string | number)[], value: unknown, maskPattern: string, revealed: boolean): HeaderCell | undefined {
  const [parent, name] = path
  if (path.length !== 2 || parent !== 'headers' || typeof name !== 'string') {
    return undefined
  }
  if (value === MASK) {
    return 'recorded-mask'
  }
  if (!isSensitiveKey(name, maskPattern)) {
    return undefined
  }
  return revealed
    ? 'plain'
    : 'revealable'
}
