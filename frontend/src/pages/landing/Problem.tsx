import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { DrawSvg, FadeIn, SectionHeader } from './bits'

gsap.registerPlugin(ScrollTrigger)

const COLS = [
  {
    title: 'Nearest is not always ready.',
    body: 'The closest hospital may have no CT, no free ICU bed or no specialist on duty.',
    art: (
      <>
        <path pathLength={1} d="M20 110h160" />
        <path pathLength={1} d="M40 110V50h60v60M100 110V70h50v40" />
        <path pathLength={1} d="M64 66v20M54 76h20" />
        <path pathLength={1} d="M116 84l18 18M134 84l-18 18" />
        <path pathLength={1} d="M150 30c0 12-12 22-12 22s-12-10-12-22a12 12 0 0 1 24 0z" />
      </>
    ),
  },
  {
    title: 'Bed data goes stale.',
    body: 'A bed count from an hour ago is a guess, not a fact.',
    art: (
      <>
        <path pathLength={1} d="M24 110V74h110v36M24 92h110M134 110V84" />
        <path pathLength={1} d="M38 74V62h30v12" />
        <path pathLength={1} d="M150 60a26 26 0 1 1-52 0a26 26 0 0 1 52 0z" />
        <path pathLength={1} d="M124 44v16l10 8" />
        <path pathLength={1} d="M20 30h40" strokeDasharray="4 4" />
      </>
    ),
  },
  {
    title: 'On paper is not in the building.',
    body: '"Has a neurosurgeon" does not mean one is there right now.',
    art: (
      <>
        <path pathLength={1} d="M30 110V36h100v74M20 110h150" />
        <path pathLength={1} d="M70 110V84h20v26" />
        <path pathLength={1} d="M48 52h16v14H48zM96 52h16v14H96z" />
        <path pathLength={1} d="M150 70a8 8 0 1 1-16 0a8 8 0 0 1 16 0zM132 104c0-14 4-22 10-22s10 8 10 22" strokeDasharray="3 3" />
        <path pathLength={1} d="M160 40l14-14" />
      </>
    ),
  },
  {
    title: 'Signals do not know.',
    body: 'Every red light on the way adds delay, and green corridors are arranged by phone.',
    art: (
      <>
        <path pathLength={1} d="M20 80h160M100 20v100" />
        <path pathLength={1} d="M60 26h20v46H60z" />
        <path pathLength={1} d="M76 37a6 6 0 1 1-12 0a6 6 0 0 1 12 0zM76 49a6 6 0 1 1-12 0a6 6 0 0 1 12 0zM76 61a6 6 0 1 1-12 0a6 6 0 0 1 12 0z" />
        <path pathLength={1} d="M130 92h30v14h-30z" />
        <path pathLength={1} d="M120 30c10 0 18 6 18 14M120 22c16 0 28 10 28 22" />
      </>
    ),
  },
]

export function Problem() {
  return (
    <section className="relative px-4 py-[72px] md:px-6 md:py-[120px]" aria-labelledby="problem-h">
      <SectionHeader
        n="01"
        id="problem-h"
        label="The problem"
        lines={['Ambulances go to', 'the nearest hospital,', 'not the right one']}
        intro="The nearest hospital is a guess about distance. Whether it can treat this patient right now is a different question, and today nobody on the call can answer it."
      />
      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {COLS.map((c, i) => (
          <FadeIn key={c.title} delay={i * 60} className="card h-full p-6">
            <p className="font-mono text-[11px] text-ink-2">[0{i + 1}]</p>
            <DrawSvg viewBox="0 0 200 130" className="my-6 h-[120px] w-full text-ink">
              {c.art}
            </DrawSvg>
            <h3 className="text-[19px] font-bold uppercase leading-tight tracking-[-0.01em]">{c.title}</h3>
            <p className="mt-2 text-[16px] text-ink-2">{c.body}</p>
          </FadeIn>
        ))}
      </div>
      <div className="mt-8 flex flex-col gap-1 font-mono text-[12px] uppercase tracking-[0.06em] md:flex-row md:items-baseline md:justify-between">
        <p className="text-ink">1,72,890 road deaths in India in 2023. About 20 every hour.</p>
        <a href="https://www.theweek.in/wire-updates/business/2025/08/28/del82-biz-road-accidents-report.html" target="_blank" rel="noreferrer" className="text-ink-2 underline underline-offset-4 hover:text-ink">
          Source: MoRTH, Road Accidents in India 2023
        </a>
      </div>
    </section>
  )
}

/** One big line per viewport; words light up as you scroll. */
export function Statements({ reduced }: { reduced: boolean }) {
  const lines = ['Not the nearest hospital.', 'The nearest one that can treat.']
  const refs = useRef<(HTMLParagraphElement | null)[]>([])
  useEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      refs.current.forEach((el) => {
        if (!el) return
        gsap.fromTo(
          el.querySelectorAll('.word'),
          { opacity: 0.12, y: 20 },
          { opacity: 1, y: 0, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'top 30%', scrub: 0.6 } },
        )
      })
    })
    return () => ctx.revert()
  }, [reduced])
  return (
    <section aria-label="Statements">
      {lines.map((l, i) => (
        <div key={l} className="relative grid min-h-[80vh] place-items-center px-4 md:min-h-screen">
          <p ref={(el) => (refs.current[i] = el)} className={`headline max-w-[1200px] text-center text-[44px] md:text-[96px] ${i ? 'text-route' : ''}`}>
            {l.split(' ').map((w, j) => (
              <span key={j} className="word mr-[0.22em] inline-block">
                {w}
              </span>
            ))}
          </p>
        </div>
      ))}
    </section>
  )
}
