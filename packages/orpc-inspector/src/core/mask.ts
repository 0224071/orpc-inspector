/** Default pattern for sensitive keys, so shared reports never leak sensitive data */
export const DEFAULT_MASK_PATTERN = String.raw`password|passwd|secret|token|cookie|credential|api[-_]?key|^(?:proxy-)?authorization$|(?:^|[-_.])session[-_]?id$`
export const MASK = '***'

function compileMask(pattern: string) {
  if (!pattern.trim()) {
    return undefined
  }
  try {
    return new RegExp(pattern, 'i')
  }
  catch {
    // Fall back to the default on an invalid pattern; better to over-mask than leak
    return new RegExp(DEFAULT_MASK_PATTERN, 'i')
  }
}

export function isValidMaskPattern(pattern: string) {
  try {
    return new RegExp(pattern, 'i') instanceof RegExp
  }
  catch {
    return false
  }
}

export function isSensitiveKey(key: string, pattern = DEFAULT_MASK_PATTERN) {
  return compileMask(pattern)?.test(key) ?? false
}

export function maskSensitive(value: unknown, pattern = DEFAULT_MASK_PATTERN): unknown {
  const regexp = compileMask(pattern)
  if (!regexp) {
    return value
  }
  const mask = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      return v.map(mask)
    }
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([key, child]) => [
          key,
          regexp.test(key)
            ? MASK
            : mask(child),
        ]),
      )
    }
    return v
  }
  return mask(value)
}
