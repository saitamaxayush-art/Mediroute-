import { ArrowRight, Info } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Confidence, Presence } from '../types'

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost'; arrow?: boolean; size?: 'sm' | 'md' | 'lg' }

const base =
  'group inline-flex select-none items-center justify-center gap-2 rounded-[4px] font-medium transition-colors duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-route'
const variants = {
  primary: 'bg-route text-white hover:bg-[#095a31]',
  secondary: 'border border-line bg-transparent text-ink hover:border-route hover:text-route',
  tertiary: '!h-auto !min-h-0 !px-0 text-ink underline-offset-4 hover:underline',
  danger: 'border border-signal/50 text-signal hover:border-signal hover:bg-[#F6DCD8]',
  ghost: 'text-ink hover:bg-paper-2',
}
const sizes = { sm: 'min-h-10 px-4 text-[14px]', md: 'min-h-10 px-4 text-[14px]', lg: 'min-h-12 px-5 text-[15px]' }

export function Button({ variant = 'primary', arrow, size = 'md', className = '', children, ...rest }: BtnProps) {
  return (
    <button type="button" className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...rest}>
      {children}
      {arrow && <ArrowRight size={16} className="transition-transform duration-200 ease-out group-hover:translate-x-1" aria-hidden />}
    </button>
  )
}

export function LinkButton({ to, variant = 'primary', arrow, size = 'md', className = '', children }: { to: string; variant?: BtnProps['variant']; arrow?: boolean; size?: BtnProps['size']; className?: string; children: ReactNode }) {
  return (
    <Link to={to} className={`${base} ${variants[variant ?? 'primary']} ${sizes[size ?? 'md']} ${className}`}>
      {children}
      {arrow && <ArrowRight size={16} className="transition-transform duration-200 ease-out group-hover:translate-x-1" aria-hidden />}
    </Link>
  )
}

export function Mono({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] uppercase tracking-[0.06em] ${className}`}>{children}</span>
}

export function SectionLabel({ n, children, className = '' }: { n: string; children: ReactNode; className?: string }) {
  return (
    <p className={`font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2 ${className}`}>
      [{n}] {children}
    </p>
  )
}

const TONE = {
  green: { dot: 'bg-route', box: 'border-route/40 bg-route-soft text-route' },
  amber: { dot: 'bg-amber', box: 'border-amber/40 bg-[#F6EBD3] text-amber' },
  red: { dot: 'bg-signal', box: 'border-signal/40 bg-[#F6DCD8] text-signal' },
  ink: { dot: 'bg-ink', box: 'border-line bg-white text-ink' },
  muted: { dot: 'bg-ink-2', box: 'border-line bg-paper-2 text-ink-2' },
}
export type Tone = keyof typeof TONE

export function Chip({ tone = 'ink', children, className = '', title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[2px] border px-2 font-mono text-[11px] uppercase tracking-[0.06em] ${TONE[tone].box} ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 ${TONE[tone].dot}`} aria-hidden />
      {children}
    </span>
  )
}

export const CONF_TONE: Record<Confidence, Tone> = { fresh: 'green', ageing: 'amber', stale: 'red' }
export const CONF_LABEL: Record<Confidence, string> = { fresh: 'Fresh', ageing: 'Ageing', stale: 'Stale' }

export function ConfidenceChip({ level, text }: { level: Confidence; text?: string }) {
  return <Chip tone={CONF_TONE[level]}>{text ?? CONF_LABEL[level]}</Chip>
}

export function PresenceChip({ presence, minutes }: { presence: Presence; minutes?: number }) {
  if (presence === 'in_building') return <Chip tone="green">In building</Chip>
  if (presence === 'on_call') return <Chip tone="amber">On call, {minutes} min</Chip>
  return <Chip tone="red">Unavailable</Chip>
}

export function SampleData({ label = 'Sample data', className = '' }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex h-6 items-center border border-dashed border-ink-2 px-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 ${className}`}>
      {label}
    </span>
  )
}

export function InfoTip({ title, lines, align = 'left' }: { title: string; lines: string[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-6 items-center gap-1 px-1 font-mono text-[11px] uppercase tracking-[0.06em] text-ink-2 hover:text-ink"
      >
        <Info size={13} aria-hidden /> {title}
      </button>
      {open && (
        <span role="tooltip" className={`float absolute top-7 z-50 w-[300px] border border-line bg-white p-3 text-left ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <span className="mb-2 block font-mono text-[11px] uppercase tracking-[0.06em] text-ink">{title}</span>
          {lines.map((l) => (
            <span key={l} className="mb-1.5 block text-[13px] leading-snug text-ink-2">
              {l}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
