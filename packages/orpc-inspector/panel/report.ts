import type { OrpcCall, OrpcHeaders } from '../src/core/types'
import type { IssueGroup } from './group-issues'
import { isSensitiveKey, MASK, maskSensitive } from '../src/core/mask'
import { groupIssues } from './group-issues'

export { DEFAULT_MASK_PATTERN, isValidMaskPattern, maskSensitive } from '../src/core/mask'

/** Each syntax can be toggled; when off, a plain-text fallback is used */
export interface ReportSyntax {
  /** `#` headings; falls back to `[ ]` */
  heading: boolean
  bold: boolean
  inlineCode: boolean
  /** Skip backticks when the text has two or more `*` (LINE breaks on them) */
  inlineCodeSkipStars: boolean
  /** ```json blocks; falls back to raw JSON */
  codeBlock: boolean
  /** `json` language tag on code blocks; falls back to a bare fence */
  codeBlockLang: boolean
  /** Issue table; falls back to a list */
  table: boolean
  /** `<details>` collapsing; falls back to expanded */
  html: boolean
  emoji: boolean
  bullet: '-' | '•'
  separator: '---' | '────'
}

export interface ReportSections {
  request: boolean
  time: boolean
  /** Repeat count after merging identical errors */
  repeat: boolean
  /** Issue fields or error message */
  issues: boolean
  input: boolean
  /** Full response (error data on HTTP errors) */
  output: boolean
  requestHeaders: boolean
  responseHeaders: boolean
}

/** Which headers to keep in the report */
export interface ReportHeaderFilter {
  /** common: x-* (except x-powered-by) plus a few common ones */
  scope: 'common' | 'all' | 'list'
  /** Header names when scope is list, comma or whitespace separated */
  list: string
}

export interface ReportOmit {
  /** Max issues listed, 0 for unlimited */
  maxIssues: number
  /** Sample values per merged issue */
  sampleValues: number
  /** Max length of an issue's actual value, 0 for unlimited */
  maxValueLength: number
  /** Max JSON array items kept, 0 for unlimited */
  maxArrayItems: number
  /** Max JSON string length, 0 for unlimited */
  maxStringLength: number
  /** Merge calls with identical errors into one */
  mergeDuplicates: boolean
}

/** Which issue message to write when the issue has a translation */
export type ReportIssueMessage = 'original' | 'translated' | 'both'

export interface ReportOptions {
  syntax: ReportSyntax
  sections: ReportSections
  omit: ReportOmit
  headers: ReportHeaderFilter
  /** Total character limit, 0 for unlimited */
  maxLength: number
  /** Case-insensitive regex matched against keys; empty disables masking */
  maskPattern: string
  issueMessage: ReportIssueMessage
}

const STATE_TITLE: Record<OrpcCall['state'], [emoji: string, text: string]> = {
  pending: ['⏳', 'Pending'],
  streaming: ['📡', 'Streaming'],
  success: ['✅', 'Success'],
  error: ['⚠️', 'Error'],
  invalid: ['❌', 'Response does not match schema'],
  cancelled: ['⏹️', 'Cancelled'],
}

function stateTitle(call: OrpcCall): [emoji: string, text: string] {
  if (call.state === 'invalid' && call.issuesOf === 'input') {
    return call.issuesSource === 'server'
      ? ['❌', 'Input rejected by server schema']
      : ['❌', 'Input does not match schema']
  }
  return STATE_TITLE[call.state]
}

/** Server-rejected input carries the error data as its response, like other errors */
function showsErrorData(call: OrpcCall) {
  return call.state === 'error' || call.issuesSource === 'server'
}

/** Keep only the first items of long arrays and cut long strings so repeated data doesn't flood the message */
export function trimJson(value: unknown, maxItems: number, maxString: number): unknown {
  if (typeof value === 'string') {
    return maxString && value.length > maxString
      ? `${value.slice(0, maxString)}…`
      : value
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, maxItems || undefined).map(v => trimJson(v, maxItems, maxString))
    return items.length < value.length
      ? [...items, `…${value.length - items.length} more items`]
      : items
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        trimJson(v, maxItems, maxString),
      ]),
    )
  }
  return value
}

const MISSING = Symbol('missing')

function getAt(value: unknown, path: (string | number)[]): unknown {
  let current = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      return MISSING
    }
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

function cell(text: string) {
  return text.replaceAll('|', String.raw`\|`).replaceAll(/\s*\n\s*/g, ' ')
}

function formatDateTime(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

interface IssueRow {
  path: string
  /** ` ×2 (items 0–1)` */
  count: string
  /** Issue code, e.g. `too_small`; empty when the issue has none */
  code: string
  message: string
  value: string
}

/** Builds the writers for the enabled syntax */
function createRenderer(syntax: ReportSyntax) {
  const code = (text: string) => (syntax.inlineCode
    && !text.includes('`')
    && !(syntax.inlineCodeSkipStars && /\*.*\*/s.test(text))
    ? `\`${text}\``
    : text)
  const bold = (text: string) => (syntax.bold
    ? `**${text}**`
    : text)
  const item = (text: string) => (syntax.bullet === '-'
    ? `- ${text}`
    : `• ${text}`)
  const json = (text: string) => (syntax.codeBlock
    ? [
        syntax.codeBlockLang
          ? '```json'
          : '```',
        text,
        '```',
      ].join('\n')
    : text)
  const more = (count: number) => `…${count} more`

  return {
    code,
    bold,
    item,
    title: (text: string) => (syntax.heading
      ? `## ${text}`
      : `[${text}]`),
    heading: (call: OrpcCall) => {
      const [emoji, text] = stateTitle(call)
      const { procedure } = call
      const label = syntax.emoji
        ? `${emoji} ${text}`
        : text
      return syntax.heading
        ? `### ${label} — ${code(procedure)}`
        : `[${label}] ${code(procedure)}`
    },
    field: (label: string, value: string) => item(`${bold(label)}: ${value}`),
    issues: (rows: IssueRow[], omitted: number) => {
      if (syntax.table) {
        return [
          '| Field | Code | Issue | Actual value |',
          '| --- | --- | --- | --- |',
          ...rows.map(
            row =>
              `| ${code(cell(row.path))}${row.count} | ${row.code
                ? code(cell(row.code))
                : ''} | ${cell(row.message)} | ${cell(row.value)} |`,
          ),
          ...(omitted
            ? [`| ${more(omitted)} | | | |`]
            : []),
        ].join('\n')
      }
      return [
        ...rows.map(row =>
          item(`${code(row.path)}${row.count}${row.code
            ? ` (${code(row.code)})`
            : ''}: ${row.message}, actual value ${row.value}`),
        ),
        ...(omitted
          ? [
              item(more(omitted)),
            ]
          : []),
      ].join('\n')
    },
    /** Plain text (e.g. headers), without the json language tag */
    plain: (label: string, text: string) =>
      syntax.codeBlock
        ? `${bold(label)}\n${['```', text, '```'].join('\n')}`
        : `${bold(label)}:\n${text}`,
    block: (label: string, text: string, collapsible: boolean) => {
      if (syntax.html && collapsible) {
        return `<details><summary>${label}</summary>\n\n${json(text)}\n\n</details>`
      }
      return `${bold(label)}${syntax.codeBlock ? '' : ':'}\n${json(text)}`
    },
    separator: syntax.separator === '---'
      ? '\n\n---\n\n'
      : '\n\n────────\n\n',
  }
}

type Renderer = ReturnType<typeof createRenderer>

function formatValue(value: unknown, options: ReportOptions, r: Renderer) {
  if (value === MISSING) {
    return '‹missing›'
  }
  const json = value === undefined
    ? 'undefined'
    : JSON.stringify(value)
  const max = options.omit.maxValueLength
  return r.code(max && json.length > max
    ? `${json.slice(0, max)}…`
    : json)
}

function issueMessage(group: IssueGroup, choice: ReportIssueMessage) {
  const translated = group.translatedMessage
  if (!translated || choice === 'original') {
    return group.message
  }
  return choice === 'both'
    ? `${translated} (${group.message})`
    : translated
}

/** source is the masked data the issues refer to (Input or Response) */
function issueSection(call: OrpcCall, source: unknown, options: ReportOptions, r: Renderer) {
  const groups = groupIssues(call.issues ?? [])
  const { maxIssues, sampleValues } = options.omit
  const shown = maxIssues
    ? groups.slice(0, maxIssues)
    : groups
  const sample = Math.max(1, sampleValues)
  const rows = shown.map((group) => {
    const values = [
      ...new Set(group.issues.map(issue => formatValue(getAt(source, issue.path), options, r))),
    ]
    return {
      path: group.path,
      count:
        group.count > 1
          ? ` ×${group.count}${group.ranges
            ? ` (items ${group.ranges})`
            : ''}`
          : '',
      // Grouped issues share path and message, so the first issue's code stands for the group
      code: group.issues[0]?.code ?? '',
      message: issueMessage(group, options.issueMessage),
      value: `${values.slice(0, sample).join(', ')}${values.length > sample
        ? ', …'
        : ''}`,
    }
  })
  return r.issues(rows, groups.length - shown.length)
}

const COMMON_HEADERS = new Set(['content-type', 'authorization', 'accept-language'])
/** Noisy headers within x-* that are skipped */
const NOISY_HEADERS = new Set(['x-powered-by'])

function headerFilter({ scope, list }: ReportHeaderFilter) {
  if (scope === 'all') {
    return () => true
  }
  if (scope === 'list') {
    const names = new Set(
      list
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean),
    )
    return (name: string) => names.has(name.toLowerCase())
  }
  return (name: string) => {
    const lower = name.toLowerCase()
    return COMMON_HEADERS.has(lower) || (lower.startsWith('x-') && !NOISY_HEADERS.has(lower))
  }
}

/** One `name: value` per line; undefined when nothing is left after filtering */
function headersText(headers: OrpcHeaders | undefined, options: ReportOptions) {
  const keep = headerFilter(options.headers)
  const lines = Object.entries(headers ?? {})
    .filter(([name]) => keep(name))
    .flatMap(([name, value]) =>
      [value].flat().map(v => `${name}: ${isSensitiveKey(name, options.maskPattern)
        ? MASK
        : v}`),
    )
  return lines.length
    ? lines.join('\n')
    : undefined
}

function jsonText(value: unknown, options: ReportOptions) {
  const trimmed = trimJson(value, options.omit.maxArrayItems, options.omit.maxStringLength)
  return JSON.stringify(trimmed, null, 2) ?? 'undefined'
}

function renderCall(call: OrpcCall, options: ReportOptions, repeat = 1) {
  const r = createRenderer(options.syntax)
  const { sections } = options
  const side = call.side === 'ssr'
    ? 'SSR'
    : 'Client'
  const request = [call.method, call.url ?? call.procedure].filter(Boolean).join(' ')
  const status = call.status === undefined
    ? ''
    : ` → ${call.status}`
  const duration = call.duration === undefined
    ? ''
    : ` · ${call.duration}ms`
  const raw = showsErrorData(call)
    ? call.error?.data
    : call.output
  const output = maskSensitive(raw, options.maskPattern)
  const input = maskSensitive(call.input, options.maskPattern)
  // The request is not sent when the client's input validation fails; the server's rejection was sent
  const sent = call.issuesOf !== 'input' || call.issuesSource === 'server'

  const fields = [
    sections.request
    && r.field('Request', sent
      ? `${request}${status} (${side})`
      : `${request} (not sent · ${side})`),
    sections.time && r.field('Time', `${formatDateTime(call.startedAt)}${duration}`),
    sections.repeat && repeat > 1 && r.field('Repeats', `Same error ×${repeat} (showing the first)`),
  ].filter((line): line is string => typeof line === 'string')

  const parts = [
    r.heading(call),
  ]
  if (fields.length) {
    parts.push(fields.join('\n'))
  }
  if (sections.issues && call.issues?.length) {
    parts.push(issueSection(call, call.issuesOf === 'input'
      ? input
      : output, options, r))
  }
  else if (sections.issues && call.error) {
    const code = call.error.code
      ? ` · ${call.error.code}`
      : ''
    parts.push(`${r.bold(`${call.error.name}${code}`)}: ${call.error.message}`)
  }
  const requestHeaders = sections.requestHeaders && headersText(call.requestHeaders, options)
  if (requestHeaders) {
    parts.push(r.plain('Request headers', requestHeaders))
  }
  if (sections.input && call.input !== undefined) {
    parts.push(r.block('Input', jsonText(input, options), false))
  }
  const responseHeaders = sections.responseHeaders && headersText(call.responseHeaders, options)
  if (responseHeaders) {
    parts.push(r.plain('Response headers', responseHeaders))
  }
  if (sections.output && output !== undefined) {
    const label = showsErrorData(call)
      ? 'Error data'
      : 'Response'
    // Success reports are for backend devs to read the data, so keep it expanded
    parts.push(r.block(label, jsonText(output, options), call.state !== 'success'))
  }
  return parts.join('\n\n')
}

const TRUNCATED = '\n…(truncated; raise the length limit or copy as Markdown)'

function truncate(text: string, limit: number) {
  let cut = text.slice(0, Math.max(0, limit - TRUNCATED.length - 4))
  const lineEnd = cut.lastIndexOf('\n')
  if (lineEnd > cut.length / 2) {
    cut = cut.slice(0, lineEnd)
  }
  if ((cut.match(/```/g)?.length ?? 0) % 2) {
    cut += '\n```'
  }
  // A limit shorter than the note itself would otherwise be exceeded
  return (cut + TRUNCATED).slice(0, limit)
}

/** Over the limit, degrade in order: drop headers → response → input → fewer issues → fewer calls → truncate */
function fitLength(
  render: (options: ReportOptions, calls: number) => string,
  options: ReportOptions,
  meta: { calls: number, issues: number },
) {
  let current = options
  let calls = meta.calls
  let text = render(current, calls)
  const limit = options.maxLength
  const fits = () => (text = render(current, calls)).length <= limit
  if (!limit || text.length <= limit) {
    return text
  }

  for (const key of [
    'responseHeaders',
    'requestHeaders',
    'output',
    'input',
  ] as const) {
    if (current.sections[key]) {
      current = {
        ...current,
        sections: { ...current.sections, [key]: false },
      }
      if (fits()) {
        return text
      }
    }
  }
  let issues = Math.min(current.omit.maxIssues || meta.issues, meta.issues)
  while (issues > 1) {
    issues = Math.ceil(issues / 2)
    current = {
      ...current,
      omit: { ...current.omit, maxIssues: issues },
    }
    if (fits()) {
      return text
    }
  }
  while (calls > 1) {
    calls--
    if (fits()) {
      return text
    }
  }
  return truncate(text, limit)
}

const issueCount = (call: OrpcCall) => groupIssues(call.issues ?? []).length

/** Default sections for a single call: success reports are for reading the data, so Input and Response are always included regardless of the template */
export function defaultCallSections(call: OrpcCall, options: ReportOptions): ReportSections {
  return call.state === 'success'
    ? { ...options.sections, input: true, output: true }
    : options.sections
}

/** Report for a single call, for backend devs or bug tickets; sections are the ones ticked for this copy and override the defaults */
export function buildCallReport(
  call: OrpcCall,
  options: ReportOptions,
  sections?: Partial<ReportSections>,
): string {
  const resolved = {
    ...options,
    sections: {
      ...defaultCallSections(call, options),
      ...sections,
    },
  }
  return fitLength(o => renderCall(call, o), resolved, {
    calls: 1,
    issues: issueCount(call),
  })
}

/** Calls with the same procedure, state, and issues or error message count as duplicates */
function duplicateKey(call: OrpcCall) {
  const detail = call.issues?.length
    ? groupIssues(call.issues).map(group => `${group.path}\n${group.message}`)
    : [call.error?.name, call.error?.code, call.error?.message]
  return JSON.stringify([
    call.procedure,
    call.state,
    call.issuesOf,
    call.issuesSource,
    call.status,
    detail,
  ])
}

/** Combines multiple calls into one report; only invalid / error calls */
export function buildErrorsReport(calls: OrpcCall[], options: ReportOptions): string {
  const targets = calls.filter(call => call.state === 'invalid' || call.state === 'error')
  const entries = new Map<string, { call: OrpcCall, repeat: number }>()
  for (const call of targets) {
    const key = options.omit.mergeDuplicates
      ? duplicateKey(call)
      : call.id
    const entry = entries.get(key)
    if (entry) {
      entry.repeat++
    }
    else {
      entries.set(key, { call, repeat: 1 })
    }
  }
  const list = [
    ...entries.values(),
  ]
  const r = createRenderer(options.syntax)

  const render = (o: ReportOptions, count: number) => {
    const parts = list.slice(0, count).map(entry => renderCall(entry.call, o, entry.repeat))
    const omitted = list.slice(count).reduce((sum, entry) => sum + entry.repeat, 0)
    const text = [
      r.title(`oRPC error report (${targets.length} calls)`),
      ...parts,
    ].join(r.separator)
    return omitted
      ? `${text}${r.separator}…${omitted} more calls not listed`
      : text
  }
  return fitLength(render, options, {
    calls: list.length,
    issues: Math.max(0, ...list.map(entry => issueCount(entry.call))),
  })
}
