import type { InjectionKey } from 'vue'
import type { ScenarioResult } from './scenarios'

/** Result of the call made during SSR; null in SPA mode (no SSR) */
export const SSR_RESULT_KEY: InjectionKey<ScenarioResult | null> = Symbol('ssr-result')

/** Global variable name used to pass it to the browser via HTML */
export const SSR_RESULT_GLOBAL = '__PLAYGROUND_SSR__'
