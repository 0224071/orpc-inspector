import type { OrpcCallIssue } from '../src/core/types'

export interface IssueGroup {
  /** Path with array indices as `[*]`; keeps the real index when there is only one */
  path: string
  message: string
  /** Translation of `message`, shared by every issue in the group */
  translatedMessage?: string
  count: number
  /** Index ranges when there is a single array level, e.g. `0–3, 7` */
  ranges?: string
  /** Original issues merged into this group */
  issues: OrpcCallIssue[]
}

export function formatPath(path: (string | number)[], wildcard = false) {
  if (path.length === 0) {
    return '(root)'
  }
  return path.reduce<string>((text, segment) => {
    if (typeof segment === 'number') {
      return `${text}[${wildcard ? '*' : segment}]`
    }
    return text
      ? `${text}.${segment}`
      : segment
  }, '')
}

function formatRanges(indices: number[]) {
  const sorted = [
    ...new Set(indices),
  ].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]!
  let prev = start
  for (const index of [
    ...sorted.slice(1),
    Number.NaN,
  ]) {
    if (index === prev + 1) {
      prev = index
      continue
    }
    parts.push(start === prev
      ? `${start}`
      : `${start}–${prev}`)
    start = index
    prev = index
  }
  return parts.join(', ')
}

/** Merge issues that differ only by array index and share a message */
export function groupIssues(issues: OrpcCallIssue[]): IssueGroup[] {
  const groups = new Map<string, { issues: OrpcCallIssue[], pattern: string }>()
  for (const issue of issues) {
    const pattern = formatPath(issue.path, true)
    const key = `${pattern}\n${issue.message}`
    const group = groups.get(key)
    if (group) {
      group.issues.push(issue)
    }
    else {
      groups.set(key, {
        issues: [issue],
        pattern,
      })
    }
  }

  return [
    ...groups.values(),
  ].map(({ issues: items, pattern }) => {
    const first = items[0]!
    if (items.length === 1) {
      return {
        path: formatPath(first.path),
        message: first.message,
        translatedMessage: first.translatedMessage,
        count: 1,
        issues: items,
      }
    }
    const numeric = first.path.filter(segment => typeof segment === 'number').length
    return {
      path: pattern,
      message: first.message,
      translatedMessage: first.translatedMessage,
      count: items.length,
      issues: items,
      ranges:
        numeric === 1
          ? formatRanges(
              items.map(item => item.path.find(s => typeof s === 'number') as number),
            )
          : undefined,
    }
  })
}
