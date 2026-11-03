import type { MessageKey } from './i18n'
import type { ReportOmit, ReportOptions, ReportSections, ReportSyntax } from './report'
import { DEFAULT_MASK_PATTERN } from './report'

export interface QuickPreset<T> {
  /** Stable name used to build templates and match values */
  id: string
  /** Translated label; presets without one show their id */
  label?: MessageKey
  value: T
}

export const SYNTAX_PRESETS: QuickPreset<ReportSyntax>[] = [
  {
    id: 'Full Markdown',
    label: 'preset.fullMarkdown',
    value: {
      heading: true,
      bold: true,
      inlineCode: true,
      inlineCodeSkipStars: false,
      codeBlock: true,
      codeBlockLang: true,
      table: true,
      html: true,
      emoji: true,
      bullet: '-',
      separator: '---',
    },
  },
  {
    id: 'Discord',
    label: 'preset.discord',
    value: {
      heading: true,
      bold: true,
      inlineCode: true,
      inlineCodeSkipStars: false,
      codeBlock: true,
      codeBlockLang: true,
      table: false,
      html: false,
      emoji: true,
      bullet: '-',
      separator: '────',
    },
  },
  {
    id: 'LINE',
    label: 'preset.line',
    value: {
      heading: false,
      bold: false,
      inlineCode: true,
      inlineCodeSkipStars: true,
      codeBlock: true,
      codeBlockLang: false,
      table: false,
      html: false,
      emoji: true,
      bullet: '•',
      separator: '────',
    },
  },
  {
    id: 'Plain text',
    label: 'preset.plainText',
    value: {
      heading: false,
      bold: false,
      inlineCode: false,
      inlineCodeSkipStars: false,
      codeBlock: false,
      codeBlockLang: true,
      table: false,
      html: false,
      emoji: true,
      bullet: '•',
      separator: '────',
    },
  },
]

export const SECTIONS_PRESETS: QuickPreset<ReportSections>[] = [
  {
    id: 'Minimal',
    label: 'preset.minimal',
    value: {
      request: true,
      time: false,
      repeat: true,
      issues: true,
      input: false,
      output: false,
      requestHeaders: false,
      responseHeaders: false,
    },
  },
  {
    id: 'Standard',
    label: 'preset.standard',
    value: {
      request: true,
      time: true,
      repeat: true,
      issues: true,
      input: true,
      output: false,
      requestHeaders: false,
      responseHeaders: false,
    },
  },
  {
    id: 'Full',
    label: 'preset.full',
    value: {
      request: true,
      time: true,
      repeat: true,
      issues: true,
      input: true,
      output: true,
      requestHeaders: false,
      responseHeaders: false,
    },
  },
]

export const OMIT_PRESETS: QuickPreset<ReportOmit>[] = [
  {
    id: 'None',
    label: 'preset.none',
    value: {
      maxIssues: 0,
      sampleValues: 3,
      maxValueLength: 0,
      maxArrayItems: 0,
      maxStringLength: 0,
      mergeDuplicates: false,
    },
  },
  {
    id: 'Light',
    label: 'preset.light',
    value: {
      maxIssues: 0,
      sampleValues: 1,
      maxValueLength: 60,
      maxArrayItems: 0,
      maxStringLength: 0,
      mergeDuplicates: true,
    },
  },
  {
    id: 'Moderate',
    label: 'preset.moderate',
    value: {
      maxIssues: 10,
      sampleValues: 1,
      maxValueLength: 60,
      maxArrayItems: 3,
      maxStringLength: 200,
      mergeDuplicates: true,
    },
  },
  {
    id: 'Heavy',
    label: 'preset.heavy',
    value: {
      maxIssues: 5,
      sampleValues: 1,
      maxValueLength: 40,
      maxArrayItems: 1,
      maxStringLength: 80,
      mergeDuplicates: true,
    },
  },
]

export const LENGTH_PRESETS: QuickPreset<number>[] = [
  { id: '2000', value: 2000 },
  { id: '4000', value: 4000 },
  { id: '5000', value: 5000 },
  { id: 'Unlimited', label: 'preset.unlimited', value: 0 },
]

/** The preset that exactly matches the current value; none means "Custom" */
export function matchPreset<T>(presets: QuickPreset<T>[], value: T) {
  return presets.find(preset => JSON.stringify(preset.value) === JSON.stringify(value))
}

function preset<T>(presets: QuickPreset<T>[], id: string) {
  return structuredClone(presets.find(item => item.id === id)!.value)
}

export interface ReportTemplate {
  id: string
  name: string
  /** Built-in templates can't be deleted but can be reset */
  builtin?: boolean
  options: ReportOptions
}

function createOptions(syntax: string, sections: string, omit: string, maxLength: number) {
  return {
    syntax: preset(SYNTAX_PRESETS, syntax),
    sections: preset(SECTIONS_PRESETS, sections),
    omit: preset(OMIT_PRESETS, omit),
    headers: { scope: 'common' as const, list: '' },
    maxLength,
    maskPattern: DEFAULT_MASK_PATTERN,
    issueMessage: 'original' as const,
  }
}

export function builtinTemplates(): ReportTemplate[] {
  return [
    {
      id: 'markdown',
      name: 'Markdown',
      builtin: true,
      options: createOptions('Full Markdown', 'Full', 'Light', 0),
    },
    {
      id: 'discord',
      name: 'Discord',
      builtin: true,
      options: createOptions('Discord', 'Full', 'Moderate', 2000),
    },
    {
      id: 'line',
      name: 'LINE',
      builtin: true,
      options: createOptions('LINE', 'Full', 'Moderate', 5000),
    },
  ]
}

/** Fill missing fields from defaults so old saves keep working when options are added */
export function withDefaults(options: Partial<ReportOptions> | undefined, base: ReportOptions) {
  return {
    syntax: {
      ...base.syntax,
      // Saves from before these options existed: json tag on, asterisk skipping off
      ...(options?.syntax && { codeBlockLang: true, inlineCodeSkipStars: false }),
      ...options?.syntax,
    },
    sections: {
      ...base.sections,
      ...options?.sections,
    },
    omit: {
      ...base.omit,
      ...options?.omit,
    },
    headers: {
      ...base.headers,
      ...options?.headers,
    },
    maxLength: options?.maxLength ?? base.maxLength,
    maskPattern: options?.maskPattern ?? base.maskPattern,
    issueMessage: options?.issueMessage ?? base.issueMessage,
  }
}
