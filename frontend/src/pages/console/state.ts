import { selCase, selTrip, useAppStore, type SyncedState } from '../../store/appStore'

export type ConsoleState = 'idle' | 'ranked' | 'dispatched' | 'corridor' | 'arrived'

/** The console renders one state at a time. */
export function consoleState(s: SyncedState): ConsoleState {
  if (!selCase(s)) return 'idle'
  const t = selTrip(s)
  if (!t) return 'ranked'
  if (t.status === 'arrived') return 'arrived'
  if (t.corridor === 'pending') return 'dispatched'
  return 'corridor'
}

export function useConsoleState() {
  return useAppStore((s) => consoleState(s))
}
