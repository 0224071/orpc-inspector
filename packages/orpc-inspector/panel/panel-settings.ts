import type { Locale } from './i18n'
import { reactive, watch } from 'vue'
import { messages } from './i18n'

const STORAGE_KEY = 'orpc-inspector:panel-settings'

export type LocaleSetting = 'auto' | Locale

export interface PanelSettings {
  /** Show the Headers blocks in call details */
  showHeaders: boolean
  /** Panel UI language; `auto` follows the browser */
  locale: LocaleSetting
}

const defaults: PanelSettings = {
  showHeaders: true,
  locale: 'auto',
}

function isLocaleSetting(value: unknown): value is LocaleSetting {
  return value === 'auto' || (typeof value === 'string' && Object.hasOwn(messages, value))
}

/** `zh` and any `zh-*` tag use Traditional Chinese; everything else English */
export function browserLocale(language = navigator.language): Locale {
  return /^zh(?:-|$)/i.test(language)
    ? 'zh-TW'
    : 'en'
}

export function resolveLocale(setting: LocaleSetting): Locale {
  return setting === 'auto'
    ? browserLocale()
    : setting
}

function load(): PanelSettings {
  let saved: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (parsed && typeof parsed === 'object') {
      saved = parsed
    }
  }
  catch {}
  // Keep only known keys whose type matches the default
  const settings = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof PanelSettings)[]) {
    if (typeof saved[key] === typeof defaults[key]) {
      (settings as Record<string, unknown>)[key] = saved[key]
    }
  }
  if (!isLocaleSetting(settings.locale)) {
    settings.locale = defaults.locale
  }
  return settings
}

/** Panel display preferences, stored in the panel's localStorage */
export function usePanelSettings() {
  const settings = reactive(load())
  watch(settings, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)), { deep: true })
  return settings
}
