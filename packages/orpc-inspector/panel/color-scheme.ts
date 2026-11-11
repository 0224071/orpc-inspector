/**
 * devframe internal: the dock keeps its theme setting in the page's localStorage under this key
 * (VueUse `useStorage`, raw `auto` / `light` / `dark`). Not a public API; checked with `@devframes/hub-ui` 1.3.3.
 * The panel shares the page's origin, so it can read the key and receives `storage` events when the dock changes it.
 */
export const DOCK_COLOR_SCHEME_KEY = 'devframes-color-scheme'

export type ColorScheme = 'dark' | 'light' | 'auto'

/** Anything other than an exact `dark` / `light` follows the system preference */
export function toColorScheme(value: string | null | undefined): ColorScheme {
  return value === 'dark' || value === 'light'
    ? value
    : 'auto'
}

function readDockColorScheme(): ColorScheme {
  try {
    return toColorScheme(localStorage.getItem(DOCK_COLOR_SCHEME_KEY))
  }
  catch {
    return 'auto'
  }
}

/** `dark` / `light` class forces the scheme in panel.css; no class leaves `color-scheme: light dark` */
function applyColorScheme(root: HTMLElement, scheme: ColorScheme) {
  root.classList.toggle('dark', scheme === 'dark')
  root.classList.toggle('light', scheme === 'light')
}

/** Keep the panel's color scheme in sync with the dock theme setting; returns a function that stops listening */
export function syncDockColorScheme(root: HTMLElement = document.documentElement): () => void {
  applyColorScheme(root, readDockColorScheme())
  const onStorage = (event: StorageEvent) => {
    // `key` is null (and `newValue` too) when the whole storage is cleared
    if (event.key === DOCK_COLOR_SCHEME_KEY || event.key === null) {
      applyColorScheme(root, toColorScheme(event.newValue))
    }
  }
  window.addEventListener('storage', onStorage)
  return () => window.removeEventListener('storage', onStorage)
}
