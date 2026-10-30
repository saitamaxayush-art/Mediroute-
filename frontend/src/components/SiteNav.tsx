import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from './Logo'

export const CONSOLES = [
  { to: '/console', name: 'Operator console', desc: 'Rank hospitals, dispatch, approve the corridor.' },
  { to: '/paramedic', name: 'Paramedic app', desc: 'Voice triage, next signal, handover note.' },
  { to: '/hospital', name: 'Hospital dashboard', desc: 'Incoming cases and one-tap status updates.' },
  { to: '/replay', name: 'Corridor replay', desc: 'Every junction of every finished trip.' },
]

const LINKS = [
  { id: 'how', label: 'How it works' },
  { id: 'features', label: 'Features' },
  { id: 'who', label: "Who it's for" },
]

/** Scrolls to a landing section, through Lenis when it is running. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement, o?: object) => void } }).__lenis
  if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 })
  else el.scrollIntoView({ behavior: 'smooth' })
}

export function SiteNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onLanding = pathname === '/'
  const [hidden, setHidden] = useState(false)
  const [active, setActive] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [drop, setDrop] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let lastY = window.scrollY
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const y = window.scrollY
        const max = document.documentElement.scrollHeight - window.innerHeight
        if (bar.current) bar.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`
        if (Math.abs(y - lastY) > 6) {
          setHidden(y > lastY && y > 120)
          lastY = y
        }
        if (onLanding) {
          let cur: string | null = null
          for (const l of LINKS) {
            const el = document.getElementById(l.id)
            if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) cur = l.id
          }
          setActive(cur)
        }
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [onLanding])

  useEffect(() => {
    if (!drop) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !dropRef.current?.contains(e.target as Node)) setDrop(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [drop])

  useEffect(() => {
    document.body.style.overflow = menu ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [menu])

  const go = (id: string) => {
    setMenu(false)
    if (onLanding) scrollToId(id)
    else navigate(`/#${id}`)
  }

  const cell = 'flex h-full items-center px-3'
  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 h-16 border-b border-line bg-paper transition-transform duration-500 ease-out ${hidden && !menu ? '-translate-y-full' : ''}`}
      >
        <nav className="flex h-full items-stretch" aria-label="Main">
          <div className="flex h-full flex-1 items-center px-4 md:px-6">
            <Logo />
          </div>
          <div className="hidden h-full items-stretch gap-2 lg:flex">
            {LINKS.map((l) => (
              <button key={l.id} type="button" onClick={() => go(l.id)} className={`${cell} gap-2 text-[15px] hover:text-route`}>
                <span className={`h-1.5 w-1.5 bg-route transition-opacity duration-300 ${active === l.id ? 'opacity-100' : 'opacity-0'}`} aria-hidden />
                {l.label}
              </button>
            ))}
            <div ref={dropRef} className="relative h-full">
              <button type="button" aria-expanded={drop} aria-haspopup="true" onClick={() => setDrop((d) => !d)} className={`${cell} gap-2 text-[15px] hover:text-route`}>
                Consoles <ChevronDown size={15} className={`transition-transform duration-300 ${drop ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              <AnimatePresence>
                {drop && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    className="float absolute left-1/2 top-[60px] w-[340px] -translate-x-1/2 rounded-[4px] border border-line bg-white p-2"
                  >
                    {CONSOLES.map((c, i) => (
                      <Link key={c.to} to={c.to} onClick={() => setDrop(false)} className="group flex items-start gap-3 rounded-[4px] p-3 hover:bg-paper">
                        <span className="mt-0.5 font-mono text-[11px] text-ink-2">[0{i + 1}]</span>
                        <span className="flex-1">
                          <span className="block text-[15px] font-medium">{c.name}</span>
                          <span className="block text-[13px] text-ink-2">{c.desc}</span>
                        </span>
                        <ArrowRight size={15} className="mt-1 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <div className="flex h-full flex-1 items-center justify-end gap-3 px-4 md:px-6">
            <Link to="/console" className="group hidden h-10 items-center gap-2 rounded-[4px] bg-route px-4 text-[14px] font-medium text-white hover:bg-[#095a31] sm:flex">
              Open console <ArrowRight size={16} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </Link>
            <button type="button" onClick={() => setMenu(true)} className="flex h-10 items-center px-2 font-mono text-[12px] uppercase tracking-[0.06em] lg:hidden" aria-expanded={menu}>
              Menu
            </button>
          </div>
        </nav>
        <div ref={bar} className="absolute bottom-[-1px] left-0 h-px w-full origin-left bg-route" style={{ transform: 'scaleX(0)' }} aria-hidden />
      </header>

      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] flex flex-col bg-paper"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
          >
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Logo />
              <button type="button" onClick={() => setMenu(false)} className="flex h-12 items-center gap-2 px-2 font-mono text-[12px] uppercase tracking-[0.06em]" aria-label="Close menu">
                Close <X size={16} aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {[...LINKS.map((l) => ({ key: l.id, label: l.label, onClick: () => go(l.id), to: null as string | null })), ...CONSOLES.map((c) => ({ key: c.to, label: c.name, onClick: () => setMenu(false), to: c.to }))].map((item, i) => (
                <motion.div
                  key={item.key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + i * 0.05, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className=""
                >
                  {item.to ? (
                    <Link to={item.to} onClick={item.onClick} className="headline flex items-baseline gap-3 px-4 py-5 text-[34px]">
                      <span className="font-mono text-[11px] font-normal text-ink-2">[0{i + 1}]</span>
                      {item.label}
                    </Link>
                  ) : (
                    <button type="button" onClick={item.onClick} className="headline flex w-full items-baseline gap-3 px-4 py-5 text-left text-[34px]">
                      <span className="font-mono text-[11px] font-normal text-ink-2">[0{i + 1}]</span>
                      {item.label}
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
            <Link to="/console" onClick={() => setMenu(false)} className="flex h-16 items-center justify-between bg-route px-4 text-[17px] font-medium text-white">
              Open console <ArrowRight size={18} aria-hidden />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
