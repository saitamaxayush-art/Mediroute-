import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { FadeIn, SectionHeader } from './bits'

type Item = { name: string; text: string }
type Group = { n: string; label: string; title: string; to: string; span: string; cols?: string; art: JSX.Element; items: Item[] }

const GROUPS: Group[] = [
  {
    n: '01',
    label: 'Matching',
    title: 'Match the hospital to the patient',
    to: '/console?panel=filtered',
    span: 'md:col-span-7',
    art: (
      <>
        <path pathLength={1} d="M4 70h88" />
        <path pathLength={1} d="M12 70V36h26v34M54 70V26h30v44" />
        <path pathLength={1} d="M69 36v14M62 43h14" stroke="#0B6B3A" strokeWidth="2" />
        <path pathLength={1} d="M20 44l10 10M30 44L20 54" />
      </>
    ),
    items: [
      { name: 'Need-based hospital matching', text: 'Hospitals without what this injury needs are removed, with reasons.' },
      { name: 'Smart ranking with editable weights', text: 'Rank by ETA, capability, beds and ER load. Weights are adjustable.' },
      { name: 'Right ambulance for the right patient', text: 'Advanced life support units go to the patients who need them.' },
      { name: 'Cashless-scheme tag', text: 'Cashless hospitals are tagged. The tag only breaks a tie.' },
    ],
  },
  {
    n: '02',
    label: 'Trust in data',
    title: 'Show how old every number is',
    to: '/hospital',
    span: 'md:col-span-5',
    art: (
      <>
        <path pathLength={1} d="M8 12h60v58H8z" />
        <path pathLength={1} d="M18 28h40M18 40h28M18 52h34" />
        <path pathLength={1} d="M92 46a16 16 0 1 1-32 0a16 16 0 0 1 32 0z" />
        <path pathLength={1} d="M76 36v10l7 5" stroke="#0B6B3A" strokeWidth="2" />
      </>
    ),
    items: [
      { name: 'Data confidence badge', text: 'Every hospital shows its last update. Stale data counts less.' },
      { name: 'Specialist in the building check', text: 'On call costs points. Unavailable fails the match.' },
      { name: 'Soft bed hold', text: 'One bed is held for 15 minutes after the operator confirms.' },
      { name: 'Hospital refusal log', text: 'Every diversion is logged. Repeated refusals lower the ranking.' },
    ],
  },
  {
    n: '03',
    label: 'The road',
    title: 'Clear the junctions ahead, only',
    to: '/console?panel=demo',
    span: 'md:col-span-7',
    art: (
      <>
        <path pathLength={1} d="M2 44h96M50 2v76" />
        <path pathLength={1} d="M44 38h12v12H44z" />
        <path pathLength={1} d="M50 78V52" stroke="#0B6B3A" strokeWidth="3" />
        <path pathLength={1} d="M50 2v34M2 44h40M58 44h40" stroke="#C8261D" strokeDasharray="3 3" />
      </>
    ),
    items: [
      { name: 'Selective green corridor', text: "Only the ambulance's approach turns green, one or two junctions ahead." },
      { name: 'Cross-traffic delay cap', text: 'Cross traffic is never held longer than 40 seconds.' },
      { name: 'Signal-cleared ETA vs normal ETA', text: 'Both times show side by side, clearly labelled simulated.' },
      { name: 'Blocked-road reporting', text: 'One report switches the trip to another real road.' },
      { name: 'Alert to drivers ahead', text: 'Drivers within 300 metres ahead are asked to make way.' },
    ],
  },
  {
    n: '04',
    label: 'Handover',
    title: 'The ER knows before the doors open',
    to: '/hospital',
    span: 'md:col-span-5',
    art: (
      <>
        <path pathLength={1} d="M14 6h48v68H14z" />
        <path pathLength={1} d="M24 22h28M24 34h20M24 46h24" />
        <path pathLength={1} d="M70 40h24M84 30l10 10-10 10" stroke="#0B6B3A" strokeWidth="2" />
      </>
    ),
    items: [
      { name: 'Hospital pre-alert', text: 'The ER sees the case, ETA and bed hold instantly.' },
      { name: 'Auto handover note', text: 'Injury, GCS, vitals and treatment, written up. No patient name.' },
      { name: 'Golden-hour countdown', text: 'A clock runs from the call and warns before time runs out.' },
    ],
  },
  {
    n: '05',
    label: 'Safety',
    title: 'People decide. Systems fail safe.',
    to: '/console?panel=demo',
    span: 'md:col-span-12',
    cols: 'sm:grid-cols-2 lg:grid-cols-5',
    art: (
      <>
        <path pathLength={1} d="M50 4l34 12v22c0 22-16 34-34 40C32 72 16 60 16 38V16z" />
        <path pathLength={1} d="M34 40l11 11 22-24" stroke="#0B6B3A" strokeWidth="2.5" />
      </>
    ),
    items: [
      { name: 'Operator in the loop', text: 'Nothing is sent and no signal changes without a human.' },
      { name: 'Fail-safe signals', text: 'If the link breaks, every junction returns to its normal cycle.' },
      { name: 'Advisory mode', text: 'Without signal control, the corridor goes to traffic police as advice.' },
      { name: 'SMS fallback', text: 'When data drops, the case still reaches the hospital by SMS.' },
      { name: 'Offline-first paramedic app', text: 'Works offline and syncs queued actions when back online.' },
    ],
  },
]

export function Features() {
  return (
    <section id="features" className="relative px-4 py-[72px] md:px-6 md:py-[120px]" aria-labelledby="features-h">
      <SectionHeader
        n="03"
        id="features-h"
        label="Features"
        lines={['What makes', 'the match honest']}
        intro="Twenty-one features in five groups. Each one exists because a real dispatch can go wrong at that step. Every one of them is live in the consoles."
      />
      <div className="mt-14 grid grid-cols-1 items-stretch gap-6 md:grid-cols-12">
        {GROUPS.map((g, i) => (
          <FadeIn key={g.label} delay={i * 60} className={`${g.span} h-full`}>
            <article className="bento group flex h-full flex-col rounded-[4px] border border-line bg-white p-8 transition-colors duration-300 hover:border-route">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2">
                    [{g.n}] {g.label}
                  </p>
                  <h3 className="mt-3 text-[24px] font-bold leading-tight tracking-[-0.01em] md:text-[28px]">{g.title}</h3>
                </div>
                <svg viewBox="0 0 100 80" className="bento-art h-[64px] w-[80px] shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  {g.art}
                </svg>
              </div>
              <ul className={`mt-8 grid flex-1 content-start gap-x-8 gap-y-5 ${g.cols ?? ''}`}>
                {g.items.map((it) => (
                  <li key={it.name} className="flex gap-3">
                    <span className="mt-[7px] h-2 w-2 shrink-0 bg-route" aria-hidden />
                    <span>
                      <span className="block text-[16px] font-bold leading-snug">{it.name}</span>
                      <span className="mt-0.5 block text-[15px] leading-snug text-ink-2">{it.text}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link to={g.to} className="mt-8 inline-flex items-center gap-1.5 self-start text-[15px] font-medium text-route underline-offset-4 hover:underline">
                Try it in the console <ArrowRight size={15} aria-hidden />
              </Link>
            </article>
          </FadeIn>
        ))}
      </div>
    </section>
  )
}
