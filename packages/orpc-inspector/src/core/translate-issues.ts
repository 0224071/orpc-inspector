import type { OrpcCall, OrpcCallIssue } from './types'
import { ISSUE_PARAM_KEYS } from './types'

/** zod error maps return a string, `{ message }` or nothing */
type ErrorMap = (issue: Record<string, unknown>) => unknown

/** Registered by `virtual:orpc-inspector/issue-translator`: the target locale and the app's zod global config (read only) */
export interface IssueTranslator {
  target: ErrorMap
  /** zod's `en` locale; the baseline while the app has not loaded zod yet (the translator runs before the app's modules) */
  english?: ErrorMap
  config: {
    customError?: ErrorMap
    localeError?: ErrorMap
  }
}

export const ISSUE_TRANSLATOR_KEY = Symbol.for('orpc-inspector:issue-translator')

export function getIssueTranslator(): IssueTranslator | undefined {
  return (globalThis as Record<symbol, IssueTranslator | undefined>)[ISSUE_TRANSLATOR_KEY]
}

function unwrapMessage(result: unknown): string | undefined {
  return typeof result === 'string'
    ? result
    : (result as { message?: string } | undefined)?.message
}

function valueAt(root: unknown, path: (string | number)[]): unknown {
  let value = root
  for (const key of path) {
    if (value === null || typeof value !== 'object') {
      return undefined
    }
    value = (value as Record<string | number, unknown>)[key]
  }
  return value
}

/** zod drops `input` from issues, so the received value comes from the recorded input / output at the issue path */
function toZodIssue(call: OrpcCall, issue: OrpcCallIssue): Record<string, unknown> {
  const zodIssue: Record<string, unknown> = { code: issue.code, path: issue.path }
  for (const key of ISSUE_PARAM_KEYS) {
    if (issue[key] !== undefined) {
      zodIssue[key] = issue[key]
    }
  }
  zodIssue.input = Object.hasOwn(issue, 'input')
    ? (issue as { input?: unknown }).input
    : valueAt(call.issuesOf === 'input'
        ? call.input
        : call.output, issue.path)
  return zodIssue
}

/**
 * Whether the message equals what the app's zod config would produce by default. Without a localeError the app may
 * simply not have imported zod yet (zod classic sets `en` on import), so `en` also counts; zod/mini stays at "Invalid input"
 */
function isDefaultMessage(message: string, zodIssue: Record<string, unknown>, translator: IssueTranslator): boolean {
  const { localeError } = translator.config
  if (localeError) {
    return unwrapMessage(localeError(zodIssue)) === message
  }
  return message === 'Invalid input' || unwrapMessage(translator.english?.(zodIssue)) === message
}

/**
 * The server's zod config is not visible in the browser: a server message counts as default when it equals zod's `en`
 * message or the app's zod locale message. The app's customError says nothing about the server, so it is not consulted
 */
function isServerDefaultMessage(message: string, zodIssue: Record<string, unknown>, translator: IssueTranslator): boolean {
  return unwrapMessage(translator.english?.(zodIssue)) === message
    || unwrapMessage(translator.config.localeError?.(zodIssue)) === message
}

/** Translates only messages equal to the default the app's zod config would produce; any doubt keeps the original */
function translateIssue(call: OrpcCall, issue: OrpcCallIssue, translator: IssueTranslator): OrpcCallIssue {
  if (!issue.code) {
    return issue
  }
  try {
    const zodIssue = toZodIssue(call, issue)
    if (call.issuesSource === 'server') {
      if (!isServerDefaultMessage(issue.message, zodIssue, translator)) {
        return issue
      }
    }
    else {
      if (unwrapMessage(translator.config.customError?.(zodIssue)) != null) {
        return issue
      }
      if (!isDefaultMessage(issue.message, zodIssue, translator)) {
        return issue
      }
    }
    const translated = unwrapMessage(translator.target(zodIssue))
    if (typeof translated !== 'string' || translated === issue.message) {
      return issue
    }
    return { ...issue, translatedMessage: translated }
  }
  catch {
    return issue
  }
}

/** Returns a copy with `translatedMessage` on translatable issues, or the same call when nothing changes */
export function translateCall(call: OrpcCall, translator: IssueTranslator): OrpcCall {
  if (!call.issues?.length) {
    return call
  }
  const issues = call.issues.map(issue => translateIssue(call, issue, translator))
  return issues.some((issue, i) => issue !== call.issues![i])
    ? { ...call, issues }
    : call
}
