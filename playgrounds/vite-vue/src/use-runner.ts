import type { Scenario, ScenarioResult } from './scenarios'
import { ref } from 'vue'
import { isAsExpected, runScenario } from './scenarios'

export interface RunEntry extends ScenarioResult {
  id: number
  key: string
  asExpected: boolean
  at: string
  ms: number
}

/** Runs one scenario at a time; keeps the last result per scenario plus a newest-first history */
export function useRunner() {
  const results = ref<Record<string, RunEntry>>({})
  const history = ref<RunEntry[]>([])
  const pending = ref<string>()
  /** Run all progress; undefined when not running all */
  const progress = ref<{ done: number, total: number }>()
  let nextId = 0

  async function trigger(scenario: Scenario) {
    pending.value = scenario.key
    const start = performance.now()
    try {
      const result = await runScenario(scenario.run)
      const entry: RunEntry = {
        ...result,
        id: nextId++,
        key: scenario.key,
        asExpected: isAsExpected(scenario.outcome, result),
        at: new Date().toLocaleTimeString('en-GB'),
        ms: Math.round(performance.now() - start),
      }
      results.value[scenario.key] = entry
      history.value.unshift(entry)
    }
    finally {
      pending.value = undefined
    }
  }

  async function triggerAll(list: Scenario[]) {
    progress.value = { done: 0, total: list.length }
    try {
      for (const scenario of list) {
        await trigger(scenario)
        progress.value.done++
      }
    }
    finally {
      progress.value = undefined
    }
  }

  function clear() {
    results.value = {}
    history.value = []
  }

  return {
    results,
    history,
    pending,
    progress,
    trigger,
    triggerAll,
    clear,
  }
}

/** Pretty-print JSON results; leave error text as-is */
export function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  }
  catch {
    return text
  }
}
