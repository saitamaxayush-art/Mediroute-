import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SiteFooter } from '../../components/SiteFooter'
import { SiteNav, scrollToId } from '../../components/SiteNav'
import { useMedia, usePageMeta, useReducedMotion } from '../../hooks/hooks'
import { FinalCta, Trust, Who } from './Closing'
import { Features } from './Features'
import { Hero } from './Hero'
import { Preloader, shouldPreload } from './Preloader'
import { Problem, Statements } from './Problem'
import { Story } from './Story'

gsap.registerPlugin(ScrollTrigger)

function useLenis(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true })
    const w = window as unknown as { __lenis?: Lenis }
    w.__lenis = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      delete w.__lenis
    }
  }, [enabled])
}

export default function Landing() {
  usePageMeta(
    'MediRoute: the right hospital, a clear road',
    'MediRoute helps 112 operators send every ambulance to the nearest hospital that can actually treat the patient, then turns the traffic signals green on the way there.',
  )
  const reduced = useReducedMotion()
  const compact = useMedia('(max-width: 767px)')
  const [preload, setPreload] = useState(() => shouldPreload(reduced))
  const { hash } = useLocation()
  useLenis(!reduced)

  useEffect(() => {
    if (!hash) return
    const id = hash.slice(1)
    const t = setTimeout(() => scrollToId(id), 400)
    return () => clearTimeout(t)
  }, [hash])

  useEffect(() => {
    // Layout settles once fonts load; let pinned sections measure again.
    document.fonts?.ready.then(() => ScrollTrigger.refresh())
  }, [])

  return (
    <>
      {preload && <Preloader onDone={() => setPreload(false)} />}
      <SiteNav />
      <main id="main" className="bg-paper">
        <Hero reduced={reduced} ready={!preload} />
        <Problem />
        <Statements reduced={reduced} />
        <Story reduced={reduced} compact={compact} />
        <Features />
        <Who />
        <Trust />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  )
}
