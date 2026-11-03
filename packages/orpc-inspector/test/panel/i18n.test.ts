import { afterEach, describe, expect, it } from 'vitest'
import { locale, messages, t, tc } from '../../panel/i18n'

describe('panel i18n', () => {
  afterEach(() => {
    locale.value = 'en'
  })

  it('has the same keys in every language', () => {
    const keys = Object.keys(messages.en).sort()
    expect(Object.keys(messages['zh-TW']).sort()).toEqual(keys)
  })

  it('has no empty messages', () => {
    for (const dictionary of Object.values(messages)) {
      expect(Object.values(dictionary).filter(text => !text.trim())).toEqual([])
    }
  })

  it('looks up the active language', () => {
    expect(t('toolbar.clear')).toBe('Clear')
    locale.value = 'zh-TW'
    expect(t('toolbar.clear')).toBe('清除')
  })

  it('has a copy failed message in every language', () => {
    expect(t('panel.copyFailed')).toBe('Copy failed')
    locale.value = 'zh-TW'
    expect(t('panel.copyFailed')).toBe('複製失敗')
  })

  it('fills placeholders', () => {
    expect(t('toolbar.copyErrors', { count: 3 })).toBe('Copy error report 3')
    expect(t('reportMenu.copyAs', { name: 'LINE' })).toBe('Copy as LINE')
  })

  it('leaves unknown placeholders as written', () => {
    expect(t('toolbar.copyErrors')).toBe('Copy error report {count}')
    expect(t('toolbar.copyErrors', { other: 1 })).toBe('Copy error report {count}')
  })

  it('uses the singular form for a count of one in English', () => {
    expect(tc('issues.inputHeading', 1)).toBe('Input does not match schema (1 issue)')
    expect(tc('issues.responseHeading', 1)).toBe('Response does not match schema (1 issue)')
    expect(tc('json.issue', 1)).toBe('✖ 1 issue')
    expect(tc('templates.char', 1)).toBe('1 char')
  })

  it('uses the plural form for other counts in English', () => {
    expect(tc('issues.inputHeading', 2)).toBe('Input does not match schema (2 issues)')
    expect(tc('issues.responseHeading', 0)).toBe('Response does not match schema (0 issues)')
    expect(tc('json.issue', 3)).toBe('✖ 3 issues')
    expect(tc('templates.char', 120)).toBe('120 chars')
  })

  it('keeps Chinese counted messages unchanged', () => {
    locale.value = 'zh-TW'
    expect(tc('issues.inputHeading', 1)).toBe('輸入不符合 schema（1 個問題）')
    expect(tc('issues.inputHeading', 2)).toBe('輸入不符合 schema（2 個問題）')
    expect(tc('templates.char', 1)).toBe('1 字元')
  })

  it('has no English message with a bare plural after {count} outside the Many form', () => {
    const offenders = Object.entries(messages.en)
      .filter(([key, text]) => !key.endsWith('Many') && /\{count\} [a-z]+s\b/.test(text))
      .map(([key]) => key)
    expect(offenders).toEqual([])
  })
})
