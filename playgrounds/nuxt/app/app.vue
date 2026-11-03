<script setup lang="ts">
import type { Scenario, ScenarioResult } from './scenarios'
import { createScenarios, isAsExpected, OUTCOME_LABELS, runScenario } from './scenarios'

interface RunEntry extends ScenarioResult {
  id: number
  key: string
  asExpected: boolean
  at: string
  ms: number
}

const SSR_KEY = 'ssr'

const { $client, $validatingClient } = useNuxtApp()
const scenarios = createScenarios($client, $validatingClient)

// Called only during SSR; the result reaches the client via payload, so the client does not refetch
const { data: ssrProfile, error: ssrError } = await useAsyncData('ssr-profile', () => $client.profile.get())

const selectedKey = ref(SSR_KEY)
const selected = computed(() => scenarios.find(s => s.key === selectedKey.value))
const groups = computed(() => [
  ...new Set(scenarios.map(s => s.procedure)),
]
  .map(procedure => ({
    procedure,
    items: scenarios.filter(s => s.procedure === procedure),
  })))

const results = ref<Record<string, RunEntry>>({})
const history = ref<RunEntry[]>([])
const pending = ref<string>()
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

async function triggerAll() {
  for (const scenario of scenarios)
    await trigger(scenario)
}

function clear() {
  results.value = {}
  history.value = []
}

const summary = computed(() => {
  const ran = Object.values(results.value)
  return {
    ran: ran.length,
    asExpected: ran.filter(r => r.asExpected).length,
  }
})

function status(scenario: Scenario) {
  if (pending.value === scenario.key)
    return 'running'
  const result = results.value[scenario.key]
  if (!result)
    return 'idle'
  return result.asExpected
    ? 'match'
    : 'mismatch'
}

/** match + error = the scenario failed the way it should; shown apart from a real failure */
function resultTone(entry: RunEntry) {
  if (!entry.asExpected)
    return 'mismatch'
  return entry.ok
    ? 'match'
    : 'expected-error'
}

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  }
  catch {
    return text
  }
}

useHead({
  title: 'oRPC Inspector Nuxt playground',
  htmlAttrs: { lang: 'en' },
})
</script>

<template>
  <div class="layout">
    <aside class="side">
      <div class="side-head">
        <strong>oRPC Nuxt playground</strong>
        <button type="button" class="primary" data-action="run-all" :disabled="Boolean(pending)" @click="triggerAll">
          {{ pending ? 'Running…' : 'Run all' }}
        </button>
      </div>
      <p v-if="summary.ran" class="summary" data-summary>
        <span :class="summary.asExpected === summary.ran ? 'match' : 'mismatch'">
          {{ summary.asExpected }}/{{ summary.ran }}
        </span>
        as expected
      </p>
      <nav>
        <h3>Server render</h3>
        <button
          type="button"
          class="item"
          :class="{ active: selectedKey === SSR_KEY }"
          @click="selectedKey = SSR_KEY"
        >
          <span class="dot" :class="ssrError ? 'mismatch' : 'match'" />
          SSR call
          <small>profile.get · useAsyncData</small>
        </button>
        <template v-for="group in groups" :key="group.procedure">
          <h3>{{ group.procedure }}</h3>
          <button
            v-for="scenario in group.items"
            :key="scenario.key"
            type="button"
            class="item"
            :class="{ active: selectedKey === scenario.key }"
            :data-scenario-item="scenario.key"
            @click="selectedKey = scenario.key"
          >
            <span class="dot" :class="status(scenario)" />
            {{ scenario.label }}
            <small>{{ OUTCOME_LABELS[scenario.outcome] }}</small>
          </button>
        </template>
      </nav>
    </aside>

    <main class="main">
      <section v-if="selectedKey === SSR_KEY" class="detail">
        <div class="meta">
          <span class="method">POST</span>
          <code>/rpc/profile/get</code>
          <span>·</span>
          <span>profile.get</span>
        </div>
        <h1>SSR call</h1>
        <p><b>Expected:</b> runs during server render; the panel shows a record with side <b>SSR</b> and the authorization header redacted.</p>
        <pre :class="ssrError ? 'mismatch' : 'match'">{{ ssrError ? String(ssrError) : JSON.stringify(ssrProfile, null, 2) }}</pre>
      </section>

      <section v-else-if="selected" class="detail">
        <div class="meta">
          <span class="method">{{ selected.method }}</span>
          <code>{{ selected.path }}</code>
          <span>·</span>
          <span>{{ selected.procedure }}</span>
        </div>
        <h1>{{ selected.label }}</h1>
        <p>
          <span class="outcome" :class="selected.outcome">{{ OUTCOME_LABELS[selected.outcome] }}</span>
          <b>Expected:</b> {{ selected.expect }}
        </p>
        <button
          type="button"
          class="primary big"
          :data-scenario="selected.key"
          :disabled="Boolean(pending)"
          @click="trigger(selected)"
        >
          {{ pending === selected.key ? 'Running…' : '▶ Run this scenario' }}
        </button>
        <template v-if="results[selected.key]">
          <h2>
            Last result
            <small>
              {{ results[selected.key]!.at }} · {{ results[selected.key]!.ms }} ms ·
              <span :class="status(selected)" data-verdict>
                {{ results[selected.key]!.asExpected ? 'as expected' : 'unexpected' }}
              </span>
            </small>
          </h2>
          <pre :class="resultTone(results[selected.key]!)">{{ pretty(results[selected.key]!.text) }}</pre>
        </template>
      </section>

      <section class="history">
        <h2>
          Run history <small>{{ history.length }} runs</small>
          <button v-if="history.length" type="button" class="link" :disabled="Boolean(pending)" @click="clear">
            Clear
          </button>
        </h2>
        <p v-if="!history.length" class="empty">
          Nothing run yet. Pick a scenario on the left, then check the records in the oRPC panel of Nuxt DevTools.
        </p>
        <ol>
          <li v-for="entry in history" :key="entry.id" @click="selectedKey = entry.key">
            <span class="dot" :class="entry.asExpected ? 'match' : 'mismatch'" />
            <span class="time">{{ entry.at }}</span>
            <span>{{ scenarios.find(s => s.key === entry.key)?.label }}</span>
            <span class="tag" :class="resultTone(entry)">{{ entry.ok ? 'ok' : 'error' }}</span>
            <span class="time">{{ entry.ms }} ms</span>
          </li>
        </ol>
      </section>
    </main>
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}
</style>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 300px 1fr;
  height: 100vh;
  color: #18181b;
  font-size: 14px;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 12px;
  overflow-y: auto;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
}

.side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.summary {
  margin: 0 4px;
  color: #64748b;
  font-size: 12px;
}

.summary span {
  font-weight: 700;
}

nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

nav h3 {
  margin: 12px 8px 4px;
  color: #64748b;
  font: 600 11px/1 ui-monospace, monospace;
  text-transform: uppercase;
}

.item {
  display: grid;
  grid-template-columns: 10px 1fr;
  gap: 2px 8px;
  align-items: center;
  padding: 6px 8px;
  text-align: left;
  background: none;
  border: 0;
  border-radius: 6px;
}

.item small {
  grid-column: 2;
  color: #94a3b8;
  font-size: 11px;
}

.item:hover {
  background: #e2e8f0;
}

.item.active {
  background: #dbeafe;
}

button {
  font: inherit;
  cursor: pointer;
}

button.primary {
  padding: 5px 12px;
  color: #fff;
  background: #2563eb;
  border: 0;
  border-radius: 6px;
}

button.primary:disabled {
  cursor: progress;
  opacity: 0.5;
}

button.big {
  padding: 10px 20px;
  font-size: 15px;
}

button.link {
  margin-left: auto;
  color: #2563eb;
  background: none;
  border: 0;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #cbd5e1;
  border-radius: 50%;
}

.dot.match {
  background: #16a34a;
}

.dot.mismatch {
  background: #dc2626;
}

.dot.running {
  background: #f59e0b;
  animation: pulse 0.8s ease-in-out infinite alternate;
}

@keyframes pulse {
  to {
    opacity: 0.3;
  }
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow-y: auto;
}

.detail {
  padding: 28px 32px;
  border-bottom: 1px solid #e2e8f0;
}

.detail h1 {
  margin: 6px 0 8px;
  font-size: 22px;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: #64748b;
  font-size: 12px;
}

.method {
  padding: 1px 6px;
  color: #1d4ed8;
  font-weight: 700;
  background: #dbeafe;
  border-radius: 4px;
}

.outcome {
  margin-right: 6px;
  padding: 1px 6px;
  font-size: 12px;
  background: #fef3c7;
  border-radius: 4px;
}

.outcome.success {
  background: #dcfce7;
}

h2 {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 20px 0 8px;
  font-size: 15px;
}

h2 small {
  color: #64748b;
  font-weight: 400;
}

pre {
  max-height: 340px;
  margin: 0;
  padding: 12px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.match {
  color: #15803d;
}

.expected-error {
  color: #a16207;
}

.mismatch {
  color: #b91c1c;
}

pre.mismatch {
  background: #fef2f2;
  border-color: #fecaca;
}

.history {
  padding: 0 32px 140px;
}

.history ol {
  margin: 0;
  padding: 0;
  list-style: none;
}

.history li {
  display: grid;
  grid-template-columns: 10px 90px 1fr auto auto;
  gap: 10px;
  align-items: center;
  padding: 6px 4px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
}

.history li:hover {
  background: #f8fafc;
}

.tag {
  font: 11px ui-monospace, monospace;
}

.time {
  color: #94a3b8;
  font: 12px ui-monospace, monospace;
}

.empty {
  color: #94a3b8;
}
</style>
