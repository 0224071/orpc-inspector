const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/

/** Array index of `segment`: a non-negative integer, or its canonical string form */
function toIndex(segment: string | number) {
  if (typeof segment === 'number') {
    return Number.isInteger(segment) && segment >= 0
      ? segment
      : undefined
  }
  return ARRAY_INDEX.test(segment)
    ? Number(segment)
    : undefined
}

/** Whether every segment of `path` resolves in `value`: object keys and array indices */
export function hasPath(value: unknown, path: (string | number)[]) {
  let current = value
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = toIndex(segment)
      if (index === undefined || index >= current.length) {
        return false
      }
      current = current[index]
      continue
    }
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return false
    }
    current = (current as Record<string | number, unknown>)[segment]
  }
  return true
}
