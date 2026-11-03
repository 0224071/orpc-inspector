import { describe, expect, it } from 'vitest'
import { dataHeaderCell, headerCell } from '../../panel/header-cell'
import { DEFAULT_MASK_PATTERN, MASK } from '../../src/core/mask'

describe('headerCell', () => {
  it('gives no reveal control for a value masked at record time', () => {
    expect(headerCell('authorization', MASK, DEFAULT_MASK_PATTERN, false)).toBe('recorded-mask')
  })

  it('lets a sensitive value kept in the record be revealed', () => {
    expect(headerCell('authorization', 'Bearer abc', DEFAULT_MASK_PATTERN, false)).toBe('revealable')
  })

  it('shows a revealed sensitive value as is', () => {
    expect(headerCell('authorization', 'Bearer abc', DEFAULT_MASK_PATTERN, true)).toBe('plain')
  })

  it('shows a non-sensitive value as is', () => {
    expect(headerCell('x-request-id', 'abc', DEFAULT_MASK_PATTERN, false)).toBe('plain')
  })
})

describe('dataHeaderCell', () => {
  it('masks a sensitive header inside error data until revealed', () => {
    expect(dataHeaderCell(['headers', 'authorization'], 'Bearer x', DEFAULT_MASK_PATTERN, false)).toBe('revealable')
    expect(dataHeaderCell(['headers', 'x-api-key'], 'y', DEFAULT_MASK_PATTERN, false)).toBe('revealable')
    expect(dataHeaderCell(['headers', 'authorization'], 'Bearer x', DEFAULT_MASK_PATTERN, true)).toBe('plain')
  })

  it('masks a multi-value sensitive header as a whole', () => {
    expect(dataHeaderCell(['headers', 'set-cookie'], ['a=1', 'b=2'], DEFAULT_MASK_PATTERN, false)).toBe('revealable')
  })

  it('gives no reveal control for a header masked at record time', () => {
    expect(dataHeaderCell(['headers', 'authorization'], MASK, DEFAULT_MASK_PATTERN, false)).toBe('recorded-mask')
  })

  it('leaves non-sensitive headers and other paths alone', () => {
    expect(dataHeaderCell(['headers', 'etag'], 'W/"1"', DEFAULT_MASK_PATTERN, false)).toBeUndefined()
    expect(dataHeaderCell(['body', 'authorization'], 'x', DEFAULT_MASK_PATTERN, false)).toBeUndefined()
    expect(dataHeaderCell(['headers'], { authorization: 'x' }, DEFAULT_MASK_PATTERN, false)).toBeUndefined()
    expect(dataHeaderCell(['headers', 'set-cookie', 0], 'a=1', DEFAULT_MASK_PATTERN, false)).toBeUndefined()
  })

  it('masks nothing with an empty pattern', () => {
    expect(dataHeaderCell(['headers', 'authorization'], 'Bearer x', '', false)).toBeUndefined()
  })
})
