export const COMBO_WINDOW_MS = 4_500
export const MAX_COMBO_MULTIPLIER = 5

export interface ComboState {
  count: number
  lastCollectedAt: number
}

export interface ComboStep extends ComboState {
  multiplier: number
  expiresAt: number
}

export function advanceCombo(current: ComboState, now: number): ComboStep {
  const continues =
    current.lastCollectedAt > 0 &&
    now >= current.lastCollectedAt &&
    now - current.lastCollectedAt <= COMBO_WINDOW_MS
  const count = continues ? current.count + 1 : 1

  return {
    count,
    lastCollectedAt: now,
    multiplier: Math.min(MAX_COMBO_MULTIPLIER, count),
    expiresAt: now + COMBO_WINDOW_MS,
  }
}
