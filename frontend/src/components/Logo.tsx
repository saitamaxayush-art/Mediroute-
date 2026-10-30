import { Link } from 'react-router-dom'

/** A cross sitting on a road junction, drawn as lines. */
export function LogoMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M0 12h24M12 0v24" stroke="currentColor" strokeWidth="1.2" />
      <rect x="6.5" y="6.5" width="11" height="11" fill="#0B6B3A" />
      <path d="M12 8.5v7M8.5 12h7" stroke="#FFFFFF" strokeWidth="2.2" />
    </svg>
  )
}

export function Logo({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 text-ink ${className}`} aria-label="MediRoute home">
      <LogoMark />
      <span className="font-mono text-[13px] font-medium tracking-[0.12em]">MEDIROUTE</span>
    </Link>
  )
}
