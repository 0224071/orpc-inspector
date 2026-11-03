/** Set by the Vite plugin's recorder module in opted-in production client builds: client records are then masked when recorded, like SSR records */
export const RECORD_MASK_KEY = Symbol.for('orpc-inspector:record-mask')

export function isRecordMaskEnabled(): boolean {
  return (globalThis as Record<symbol, unknown>)[RECORD_MASK_KEY] === true
}
