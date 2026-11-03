import { describe, expect, it } from 'vitest'
import { formatPath, groupIssues } from '../../panel/group-issues'

const missing = 'Invalid input: expected string, received undefined'

describe('groupIssues', () => {
  it('keeps the original index for a single issue', () => {
    expect(groupIssues([
      {
        path: ['items', 3, 'name'],
        message: missing,
      },
    ])).toMatchObject([
      { path: 'items[3].name', message: missing, count: 1 },
    ])
  })

  it('merges issues differing only by array index and compresses index ranges', () => {
    const issues = [0, 1, 2, 3, 7, 9, 10].map(i => ({
      path: ['items', i, 'name'],
      message: missing,
    }))
    expect(groupIssues(issues)).toMatchObject([
      {
        path: 'items[*].name',
        message: missing,
        count: 7,
        ranges: '0–3, 7, 9–10',
      },
    ])
  })

  it('does not merge different messages', () => {
    const groups = groupIssues([
      {
        path: ['items', 0, 'id'],
        message: 'expected number',
      },
      {
        path: ['items', 1, 'id'],
        message: 'expected string',
      },
    ])
    expect(groups.map(g => g.path)).toEqual(['items[0].id', 'items[1].id'])
  })

  it('shows only the count for nested arrays', () => {
    const groups = groupIssues([
      {
        path: ['items', 0, 'roles', 0],
        message: missing,
      },
      {
        path: ['items', 1, 'roles', 2],
        message: missing,
      },
    ])
    expect(groups).toMatchObject([
      { path: 'items[*].roles[*]', message: missing, count: 2 },
    ])
    expect(groups[0]!.ranges).toBeUndefined()
  })
})

describe('groupIssues translations', () => {
  it('keeps the translation and groups by the original message', () => {
    const groups = groupIssues([0, 1].map(i => ({
      path: ['items', i, 'name'],
      message: missing,
      translatedMessage: '無效的輸入值',
    })))
    expect(groups).toMatchObject([
      { message: missing, translatedMessage: '無效的輸入值', count: 2 },
    ])
  })

  it('leaves translatedMessage unset without a translation', () => {
    expect(groupIssues([
      {
        path: ['a'],
        message: missing,
      },
    ])[0]!.translatedMessage).toBeUndefined()
  })
})

describe('formatPath', () => {
  it('formats the root path', () => {
    expect(formatPath([])).toBe('(root)')
  })
})
