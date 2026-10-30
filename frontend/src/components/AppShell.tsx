import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { LogoMark } from './Logo'
import { SampleData } from './ui'
import { useNow } from '../hooks/hooks'
import { useAppStore, type Role } from '../store/appStore'

const ROLES: { id: Role; label: string }[] = [
  { id: 'operator', label: 'Operator' },
  { id: 'paramedic', label: 'Paramedic' },
  { id: 'hospital', label: 'Hospital' },
]

/** Three dots, green when a tab for that role sent a heartbeat in the last 5 seconds. */
function Presence() {
  const presence = useAppStore((s) => s.presence)
  const now = useNow(2000)
  const on = ROLES.map((r) => ({ ...r, live: now - presence[r.id] < 5000 }))
  return (
    <div className="flex items-center gap-1.5 px-1" role="status" aria-label={`Open: ${on.filter((r) => r.live).map((r) => r.label).join(', ') || 'none'}`}>
      {on.map((r) => (
        <span key={r.id} title={`${r.label} ${r.live ? 'online' : 'not open'}`} className={`h-2.5 w-2.5 rounded-full border ${r.live ? 'border-route bg-route' : 'border-ink-2 bg-transparent'}`} />
      ))}
    </div>
  )
}

const TABS = [
  { to: '/console', label: 'Operator' },
  { to: '/paramedic', label: 'Paramedic' },
  { to: '/hospital', label: 'Hospital' },
  { to: '/replay', label: 'Replay' },
]

/**
 * Shared frame for the four app pages: a 56px bar with the logo, page tabs, page-specific
 * actions, the Sample data chip and a Home link. `fill` pins the page to the viewport height.
 */
export function AppShell({ children, actions, fill = false, mobileChip = true }: { children: ReactNode; actions?: ReactNode; fill?: boolean; mobileChip?: boolean }) {
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [menu])

  return (
    <div className={`flex flex-col bg-paper ${fill ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh]'}`}>
      <header className={`z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper px-3 md:px-4 ${fill ? '' : 'sticky top-0'}`}>
        <Link to="/" className="flex h-10 items-center gap-2.5 rounded-[4px] pr-2 text-ink" aria-label="MediRoute home">
          <LogoMark />
          <span className="hidden font-mono text-[13px] font-medium tracking-[0.12em] xl:inline">MEDIROUTE</span>
        </Link>
        <nav aria-label="Consoles" className="ml-2 hidden h-full items-stretch gap-1 lg:flex">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex items-center border-b-2 px-3 text-[14px] font-medium transition-colors ${isActive ? 'border-route text-route' : 'border-transparent text-ink hover:text-route'}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <Presence />
          {actions}
          <SampleData className={mobileChip ? '' : 'hidden sm:inline-flex'} />
          <Link to="/" className="hidden h-10 items-center px-2 text-[14px] text-ink underline-offset-4 hover:underline lg:flex">
            Home
          </Link>
          <button type="button" onClick={() => setMenu(true)} aria-expanded={menu} className="flex h-10 items-center px-2 font-mono text-[12px] uppercase tracking-[0.06em] lg:hidden">
            Menu
          </button>
        </div>
      </header>
      <div className={fill ? 'min-h-0 flex-1' : 'flex-1'}>{children}</div>
      {!fill && (
        <footer className="border-t border-line px-4 py-5 md:px-6">
          <p className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2">
            <span>Sample data only</span>
            <Link to="/privacy" className="hover:text-ink">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-ink">
              Terms and Conditions
            </Link>
          </p>
        </footer>
      )}

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[90] flex flex-col bg-paper"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-3">
              <Link to="/" onClick={() => setMenu(false)} className="flex h-10 items-center" aria-label="MediRoute home">
                <LogoMark />
              </Link>
              <button type="button" onClick={() => setMenu(false)} className="flex h-12 items-center gap-2 px-2 font-mono text-[12px] uppercase tracking-[0.06em]" aria-label="Close menu" autoFocus>
                Close <X size={16} aria-hidden />
              </button>
            </div>
            <nav aria-label="Consoles" className="flex-1 overflow-y-auto px-4 py-6">
              {[...TABS, { to: '/', label: 'Home' }].map((t, i) => (
                <motion.div key={t.to} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 * i, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                  <NavLink
                    to={t.to}
                    end
                    onClick={() => setMenu(false)}
                    className={({ isActive }) => `headline flex min-h-14 items-center text-[34px] ${isActive ? 'text-route' : 'text-ink'}`}
                  >
                    {t.label}
                  </NavLink>
                </motion.div>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-4">
              <SampleData />
              <Link to="/privacy" onClick={() => setMenu(false)} className="text-[14px] underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
              <Link to="/terms" onClick={() => setMenu(false)} className="text-[14px] underline-offset-4 hover:underline">
                Terms
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Right-side sheet used by the console for the log, settings and weights. */
export function Sheet({ open, onClose, title, children, width = 420 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-ink/20" onClick={onClose} aria-hidden />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-y-0 right-0 z-[71] flex w-full flex-col border-l border-line bg-paper"
            style={{ maxWidth: width }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
              <h2 className="text-[16px] font-bold">{title}</h2>
              <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-[4px] hover:bg-paper-2" aria-label={`Close ${title}`} autoFocus>
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
