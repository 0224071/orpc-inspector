/**
 * Copy text to the clipboard. The iframe may lack clipboard-write permission, so fall back to execCommand.
 * Resolves to whether the text was copied.
 */
export async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {}
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;opacity:0'
  document.body.append(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  }
  catch {
    return false
  }
  finally {
    textarea.remove()
  }
}

export type CopyTarget = 'detail' | 'all'

/** Result of the last copy, shown briefly on the button that triggered it */
export interface CopyResult {
  target: CopyTarget
  ok: boolean
}

/** Message to show on a copy button instead of its idle label, if any */
export function copyResultKey(result: CopyResult | undefined, target: CopyTarget) {
  if (result?.target !== target) {
    return undefined
  }
  return result.ok
    ? 'panel.copied' as const
    : 'panel.copyFailed' as const
}
