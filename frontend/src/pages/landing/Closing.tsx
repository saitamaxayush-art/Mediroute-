import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LinkButton } from '../../components/ui'
import { DrawSvg, FadeIn, RevealLines, SectionHeader } from './bits'

const ROLES = [
  { name: '112 Operators', sees: 'A ranked list of hospitals that can treat this patient, the right ambulance, and one button to confirm.', to: '/console', link: 'Operator console' },
  { name: 'Paramedics', sees: 'Voice triage, the destination, the next signal ahead, and a handover note that writes itself.', to: '/paramedic', link: 'Paramedic app' },
  { name: 'ER Teams', sees: 'Who is coming, how soon, what injury and what was given, before the doors open.', to: '/hospital', link: 'Hospital dashboard' },
  { name: 'Traffic Police', sees: 'Which junctions are held, for how long, and a hard cap on cross-traffic delay.', to: '/replay', link: 'Corridor replay' },
  { name: 'City Officials', sees: 'Every corridor replayed junction by junction, with holds, re-routes and time saved.', to: '/replay', link: 'Corridor replay' },
]

export function Who() {
  const [open, setOpen] = useState(0)
  return (
    <section id="who" className="relative px-4 py-[72px] md:px-6 md:py-[120px]" aria-labelledby="who-h">
      <SectionHeader
        n="04"
        id="who-h"
        label="Who it's for"
        lines={['Five people,', 'one patient']}
        intro="Each role sees only what it needs to act on. Hover or tap a role to see its view, then open its console."
      />
      <div className="mt-14 flex flex-col gap-4 md:h-[440px] md:flex-row">
        {ROLES.map((r, i) => {
          const isOpen = open === i
          return (
            <div
              key={r.name}
              onMouseEnter={() => setOpen(i)}
              onFocus={() => setOpen(i)}
              onClick={() => setOpen(i)}
              className={`relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-[4px] border p-6 transition-[flex-grow,background-color,border-color] duration-500 ease-out ${isOpen ? 'border-route bg-white md:flex-[3]' : 'border-line bg-white md:flex-1 hover:border-ink'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-mono text-[12px] text-ink-2">[0{i + 1}]</span>
                <span className={`h-2 w-2 ${isOpen ? 'bg-route' : 'bg-ink-2'}`} aria-hidden />
              </div>
              <div className="mt-6 md:mt-0">
                <h3 className={`headline text-[26px] md:text-[30px] ${isOpen ? '' : 'md:rotate-180 md:[writing-mode:vertical-rl]'}`}>{r.name}</h3>
                <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="min-h-0 overflow-hidden">
                    <p className="mt-3 max-w-[420px] text-[16px] text-ink-2">{r.sees}</p>
                    <Link to={r.to} tabIndex={isOpen ? 0 : -1} className="group mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium text-route">
                      {r.link} <ArrowRight size={15} className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const TRUST = [
  { title: 'No patient names', body: 'Injury class only, following the DPDP Act 2023. There is no name, phone or ID field anywhere.' },
  { title: 'A human approves every corridor', body: 'No signal changes until an operator approves. Every action is logged with a timestamp.' },
  { title: 'Signals fail safe', body: 'If the link breaks, junctions return to their normal cycle and the operator is told at once.' },
]

export function Trust() {
  return (
    <section className="relative px-4 py-[72px] md:px-6 md:py-[120px]" aria-labelledby="trust-h">
      <SectionHeader
        n="05"
        id="trust-h"
        label="Care by design"
        lines={['Trust, not hype']}
        intro="An emergency system is only useful if people can rely on it when things go wrong. These three rules are built in, not added on."
      />
      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {TRUST.map((t, i) => (
          <FadeIn key={t.title} delay={i * 60} className="card h-full p-6">
            <p className="font-mono text-[12px] text-ink-2">[0{i + 1}]</p>
            <h3 className="mt-6 text-[20px] font-bold uppercase leading-tight">{t.title}</h3>
            <p className="mt-2 text-[16px] text-ink-2">{t.body}</p>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="relative px-4 py-[72px] text-center md:px-6 md:py-[120px]" aria-labelledby="cta-h">
      <DrawSvg viewBox="0 0 400 220" className="mx-auto h-[180px] w-full max-w-[420px] text-ink" label="Line drawing of an ambulance at a junction">
        <path pathLength={1} d="M0 150h400M220 0v220" />
        <path pathLength={1} d="M0 166h200M240 166h160M236 0v134" strokeDasharray="6 6" />
        <path pathLength={1} d="M70 118h96v32H70zM166 128h22l10 12v10h-32z" />
        <path pathLength={1} d="M92 124v14M85 131h14" stroke="#C8261D" />
        <path pathLength={1} d="M96 150a8 8 0 1 1-16 0M180 150a8 8 0 1 1-16 0" />
        <path pathLength={1} d="M250 60h14v40h-14z" />
        <path pathLength={1} d="M257 70a3 3 0 1 1 0.1 0M257 90a3 3 0 1 1 0.1 0" stroke="#0B6B3A" />
      </DrawSvg>
      <RevealLines id="cta-h" lines={['See it on a live map']} className="headline mx-auto mt-10 text-[40px] md:text-[80px]" />
      <div className="mt-8 flex flex-col items-center gap-4">
        <LinkButton to="/console" size="lg" arrow>
          Open the operator console
        </LinkButton>
        <Link to="/hospital" target="_blank" className="text-[15px] text-ink-2 underline underline-offset-4 hover:text-ink">
          Open the hospital dashboard in a second tab to watch them sync
        </Link>
      </div>
    </section>
  )
}
