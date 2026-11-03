import type { ReportTemplate } from './report-presets'
import { reactive, ref, watch } from 'vue'
import { builtinTemplates, withDefaults } from './report-presets'

const STORAGE_KEY = 'orpc-inspector:report-templates'

interface SavedSettings {
  lastId?: string
  templates?: ReportTemplate[]
}

function load() {
  let saved: SavedSettings = {}
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  }
  catch {}
  const builtins = builtinTemplates()
  const savedList = Array.isArray(saved.templates)
    ? saved.templates
    : []
  const templates = [
    ...builtins.map((template) => {
      const stored = savedList.find(item => item.id === template.id)
      return {
        ...template,
        options: withDefaults(stored?.options, template.options),
      }
    }),
    ...savedList
      .filter(item => !item.builtin && item.id && item.name)
      .map(item => ({
        ...item,
        options: withDefaults(item.options, builtins[0]!.options),
      })),
  ]
  const lastId = templates.some(item => item.id === saved.lastId)
    ? saved.lastId!
    : 'markdown'
  return { lastId, templates }
}

/** Report templates: built-in plus user-defined, stored in the panel's localStorage */
export function useReportTemplates() {
  const saved = load()
  const templates = reactive(saved.templates)
  const lastId = ref(saved.lastId)

  watch(
    [lastId, templates],
    () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ lastId: lastId.value, templates })),
    { deep: true },
  )

  function find(id: string) {
    return templates.find(item => item.id === id)
  }

  /** Duplicate an existing template */
  function duplicate(id: string) {
    const source = find(id) ?? templates[0]!
    const template: ReportTemplate = {
      id: `custom-${Date.now().toString(36)}`,
      name: `${source.name} copy`,
      // structuredClone does not work on reactive proxies
      options: JSON.parse(JSON.stringify(source.options)),
    }
    templates.push(template)
    return template.id
  }

  function remove(id: string) {
    const index = templates.findIndex(item => item.id === id && !item.builtin)
    if (index !== -1) {
      templates.splice(index, 1)
    }
    if (lastId.value === id) {
      lastId.value = templates[0]!.id
    }
  }

  function reset(id: string) {
    const template = find(id)
    const original = builtinTemplates().find(item => item.id === id)
    if (template && original) {
      template.options = original.options
    }
  }

  function use(id: string) {
    if (find(id)) {
      lastId.value = id
    }
  }

  return {
    templates,
    lastId,
    find,
    use,
    duplicate,
    remove,
    reset,
  }
}
