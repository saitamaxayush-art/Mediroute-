import { ScrollText, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell, Sheet } from '../../components/AppShell'
import { GoldenClock } from '../../components/GoldenClock'
import { SampleData } from '../../components/ui'
import { useMedia, usePageMeta } from '../../hooks/hooks'
import { goldenLeft } from '../../services/api'
import { useAppStore, useCase, useRole } from '../../store/appStore'
import { CasePanel } from './CasePanel'
import { ConsoleMap } from './ConsoleMap'
import { AuditLog, SettingsContent, TripBar } from './ConsoleParts'
import { DemoMenu } from './DemoMenu'
import { ResultPanel } from './ResultPanel'
import { useConsoleState } from './state'

/** Golden-hour clock that subscribes on its own, so its 10 Hz ticks re-render only itself. */
export function LiveGoldenClock({ compact = true }: { compact?: boolean }) {
  const g = useGolden()
  return <GoldenClock remainingS={g.remaining} frozen={g.frozen} compact={compact} />
}

export function useGolden() {
  // The case clock is shared by every tab, so all views show the same value.
  const kase = useCase()
  return { remaining: goldenLeft(kase), frozen: !!kase?.frozen }
}

type Tab = 'case' | 'map' | 'result'
const iconBtn = 'flex h-10 items-center gap-2 rounded-[4px] border border-line px-3 text-[14px] font-medium hover:border-route hover:text-route'

export default function Console() {
  usePageMeta('Operator console | MediRoute', 'Find the hospital that can treat the patient, dispatch the right ambulance and approve a green corridor. Sample data.')
  useRole('operator')
  const [params] = useSearchParams()
  const panel = params.get('panel')
  const state = useConsoleState()
  const linkLost = useAppStore((s) => s.settings.signalLinkLost)
  const networkUp = useAppStore((s) => s.settings.networkUp)
  const wide = useMedia('(min-width: 1024px)')
  const [log, setLog] = useState(panel === 'log' || panel === 'trip')
  const [settings, setSettings] = useState<false | 'all' | 'weights'>(panel === 'weights' ? 'weights' : false)
  const [tab, setTab] = useState<Tab>('case')

  // On small screens, follow the flow: results after ranking, the map once the ambulance moves.
  useEffect(() => {
    if (state === 'idle') setTab('case')
    if (state === 'ranked' || state === 'arrived') setTab('result')
    if (state === 'corridor') setTab('map')
  }, [state])

  const actions = (
    <>
      <LiveGoldenClock />
      <DemoMenu initialOpen={panel === 'demo'} />
      <button type="button" className={iconBtn} onClick={() => setLog(true)} aria-label="Audit log">
        <ScrollText size={15} aria-hidden /> <span className="hidden sm:inline">Log</span>
      </button>
      <button type="button" className={`${iconBtn} !px-0 w-10 justify-center`} onClick={() => setSettings('all')} aria-label="Settings">
        <Settings size={16} aria-hidden />
      </button>
    </>
  )

  const map = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <ConsoleMap />
      </div>
      <TripBar />
    </div>
  )

  return (
    <AppShell fill actions={actions} mobileChip={false}>
      <div className="flex h-full flex-col">
        {linkLost && (
          <p className="shrink-0 bg-signal px-5 py-2 text-[14px] text-white" role="alert">
            Signal link lost. Normal cycle restored. Advisory mode on. Signal commands are disabled.
          </p>
        )}
        {!networkUp && (
          <p className="shrink-0 bg-amber px-5 py-2 text-[14px] text-white" role="status">
            Network drop simulated. The paramedic app is on SMS fallback.
          </p>
        )}
        {wide ? (
          <div className="flex min-h-0 flex-1">
            <aside className="w-[340px] shrink-0 border-r border-line bg-paper" aria-label="Case">
              <CasePanel />
            </aside>
            <main className="min-w-0 flex-1">{map}</main>
            <aside className="w-[380px] shrink-0 border-l border-line bg-paper" aria-label="Result">
              <ResultPanel onWeights={() => setSettings('weights')} />
            </aside>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2" role="tablist" aria-label="Console views">
              {(
                [
                  ['case', 'Case'],
                  ['map', 'Map'],
                  ['result', 'Result'],
                ] as [Tab, string][]
              ).map(([id, l]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`h-10 flex-1 rounded-[4px] text-[14px] font-medium ${tab === id ? 'bg-route-soft text-route' : 'text-ink hover:text-route'}`}
                >
                  {l}
                </button>
              ))}
              <SampleData className="sm:hidden" />
            </div>
            <div className="relative min-h-0 flex-1">
              <div className={`absolute inset-0 ${tab === 'map' ? '' : 'invisible'}`}>{map}</div>
              {tab === 'case' && (
                <div className="absolute inset-0 bg-paper">
                  <CasePanel />
                </div>
              )}
              {tab === 'result' && (
                <div className="absolute inset-0 bg-paper">
                  <ResultPanel onWeights={() => setSettings('weights')} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <Sheet open={log} onClose={() => setLog(false)} title="Audit log" width={520}>
        <AuditLog />
      </Sheet>
      <Sheet open={settings !== false} onClose={() => setSettings(false)} title="Settings">
        <SettingsContent focusWeights={settings === 'weights'} />
      </Sheet>
    </AppShell>
  )
}
