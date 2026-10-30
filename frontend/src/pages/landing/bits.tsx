import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SectionLabel } from '../../components/ui'

/** Fires once when the element scrolls into view. */
export function useInView<T extends Element>(margin = '-10% 0px') {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || seen) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          io.disconnect()
        }
      },
      { rootMargin: margin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [margin, seen])
  return [ref, seen] as const
}

/** Headline lines slide up 100% inside an overflow-hidden mask, staggered 60 ms. */
export function RevealLines({ lines, className = '', as: Tag = 'h2', delay = 0, play = true, id }: { lines: string[]; className?: string; as?: 'h1' | 'h2' | 'p'; delay?: number; play?: boolean; id?: string }) {
  const [ref, inView] = useInView<HTMLHeadingElement>()
  const seen = inView && play
  return (
    <Tag ref={ref as never} id={id} className={className} aria-label={lines.join(' ')}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.06em]" aria-hidden="true">
          <span
            className="block transition-transform duration-[900ms] ease-out"
            style={{ transform: seen ? 'translateY(0)' : 'translateY(105%)', transitionDelay: `${delay + i * 60}ms` }}
          >
            {l}
          </span>
        </span>
      ))}
    </Tag>
  )
}

export function FadeIn({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={`transition-[opacity,transform] duration-700 ease-out ${className}`}
      style={{ opacity: seen ? 1 : 0, transform: seen ? 'none' : 'translateY(16px)', transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/** SVG whose paths draw themselves when scrolled into view. Paths need pathLength="1". */
export function DrawSvg({ children, className = '', viewBox, label, duration = 1400 }: { children: ReactNode; className?: string; viewBox: string; label?: string; duration?: number }) {
  const [ref, seen] = useInView<SVGSVGElement>()
  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      className={`draw-svg ${seen ? 'is-drawn' : ''} ${className}`}
      style={{ ['--draw-ms' as string]: `${duration}ms` }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="square"
    >
      {children}
    </svg>
  )
}

/** Label and headline on the left, a short intro on the right, so a section header uses the full width. */
export function SectionHeader({ n, label, lines, intro, id }: { n: string; label: string; lines: string[]; intro: string; id?: string }) {
  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
      <div className="lg:col-span-7">
        <SectionLabel n={n}>{label}</SectionLabel>
        <RevealLines id={id} lines={lines} className="headline mt-5 text-[40px] md:text-[64px] xl:text-[72px]" />
      </div>
      <FadeIn className="lg:col-span-5">
        <p className="max-w-[560px] text-[18px] leading-[1.55] text-ink">{intro}</p>
      </FadeIn>
    </div>
  )
}
