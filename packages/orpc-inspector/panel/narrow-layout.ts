import type { Ref } from 'vue'
import { getCurrentScope, onScopeDispose, ref } from 'vue'

/** The panel is its own document inside the dock iframe, so this measures the panel, not the app page */
export const NARROW_QUERY = '(max-width: 639.98px)'

export type PanelView = 'split' | 'list' | 'detail'

/** Which part of the body is shown; `detailOpen` is false after the back control */
export function narrowView(narrow: boolean, hasSelection: boolean, detailOpen: boolean): PanelView {
  if (!narrow) {
    return 'split'
  }
  return hasSelection && detailOpen
    ? 'detail'
    : 'list'
}

export function useNarrow(): Ref<boolean> {
  const query = matchMedia(NARROW_QUERY)
  const narrow = ref(query.matches)
  const update = (event: { matches: boolean }) => {
    narrow.value = event.matches
  }
  query.addEventListener('change', update)
  if (getCurrentScope()) {
    onScopeDispose(() => query.removeEventListener('change', update))
  }
  return narrow
}
