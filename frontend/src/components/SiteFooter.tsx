import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { scrollToId } from './SiteNav'
import { useLocation, useNavigate } from 'react-router-dom'

export function SiteFooter() {
  const wm = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const go = (id: string) => (pathname === '/' ? scrollToId(id) : navigate(`/#${id}`))

  const onMove = (e: React.PointerEvent) => {
    const el = wm.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  const onLeave = () => {
    wm.current?.style.setProperty('--mx', '-999px')
    wm.current?.style.setProperty('--my', '-999px')
  }

  const col = 'min-w-0'
  const head = 'mb-4 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2'
  const link = 'block py-1 text-left text-[15px] hover:text-route'
  return (
    <footer className="border-t border-line bg-paper">
      <div className="grid grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className={col}>
          <p className={head}>Product</p>
          <Link className={link} to="/console">Operator console</Link>
          <Link className={link} to="/paramedic">Paramedic app</Link>
          <Link className={link} to="/hospital">Hospital dashboard</Link>
          <Link className={link} to="/replay">Corridor replay</Link>
        </div>
        <div className={col}>
          <p className={head}>Project</p>
          <button type="button" className={link} onClick={() => go('how')}>How it works</button>
          <button type="button" className={link} onClick={() => go('features')}>Features</button>
          <button type="button" className={link} onClick={() => go('who')}>Who it's for</button>
        </div>
        <div className={col}>
          <p className={head}>Legal</p>
          <Link className={link} to="/privacy">Privacy Policy</Link>
          <Link className={link} to="/terms">Terms and Conditions</Link>
        </div>
        <div className={col}>
          <p className={head}>Contact</p>
          <a className={`${link} break-all`} href="mailto:team@mediroute.example">team@mediroute.example</a>
        </div>
      </div>
      <div ref={wm} onPointerMove={onMove} onPointerLeave={onLeave} className="relative select-none overflow-hidden px-2 pt-6 md:px-4" aria-hidden="true">
        <div className="wordmark wordmark-outline text-[16.4vw]">MEDIROUTE</div>
        <div className="wordmark wordmark-fill absolute inset-0 px-2 pt-6 text-[16.4vw] md:px-4">MEDIROUTE</div>
      </div>
      <p className="px-4 py-6 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 md:px-6">
        &copy; 2026 MediRoute. Prototype built for Geek Fiesta &apos;26 Ideathon. Sample data only.
      </p>
    </footer>
  )
}
