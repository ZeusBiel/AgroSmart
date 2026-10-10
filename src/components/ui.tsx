import type { LucideIcon } from 'lucide-react'
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Severity } from '../domain/types'
import type { Tone } from './tones'

export function StatusPill({ text, tone }: { text: string; tone: Tone }) {
  return <span className={`status-pill ${tone}`}>{text}</span>
}

const severityIcons: Record<Severity, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: AlertOctagon,
}

export function SeverityIcon({ severity }: { severity: Severity }) {
  const Icon = severityIcons[severity]
  return <Icon className={`severity-icon ${severity}`} aria-hidden="true" />
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  meta,
  tone = 'neutral',
}: {
  icon: LucideIcon
  label: string
  value: string
  meta?: ReactNode
  tone?: Tone
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <Icon aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {meta && <small>{meta}</small>}
      </div>
    </article>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  )
}

/** Barra de faixa: mostra o valor atual dentro da escala com a faixa ideal destacada. */
export function RangeBar({
  value,
  scale,
  ideal,
  target,
  color,
  label,
}: {
  value: number
  scale: [number, number]
  ideal: [number, number]
  target?: number
  color: string
  label: string
}) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - scale[0]) / (scale[1] - scale[0])) * 100))}%`
  return (
    <span className="range-bar" role="img" aria-label={label}>
      <span className="range-ideal" style={{ left: pct(ideal[0]), right: `calc(100% - ${pct(ideal[1])})` }} />
      {target !== undefined && <span className="range-target" style={{ left: pct(target) }} />}
      <span className="range-marker" style={{ left: pct(value), background: color }} />
    </span>
  )
}

export function Meter({ value, tone }: { value: number; tone: Tone }) {
  return (
    <div className={`meter ${tone}`} aria-hidden="true">
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? 'active' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
