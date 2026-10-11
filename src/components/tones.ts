import type { HealthStatus } from '../analytics/analysis'
import type { QualityFlag, Severity } from '../domain/types'

export type Tone = 'neutral' | 'success' | 'warning' | 'critical'

export const severityTone: Record<Severity, Tone> = {
  info: 'neutral',
  success: 'success',
  warning: 'warning',
  critical: 'critical',
}

export const severityLabel: Record<Severity, string> = {
  info: 'Info',
  success: 'Sucesso',
  warning: 'Atenção',
  critical: 'Crítico',
}

export const healthTone: Record<HealthStatus, Tone> = {
  good: 'success',
  attention: 'warning',
  critical: 'critical',
}

export const healthLabel: Record<HealthStatus, string> = {
  good: 'Saudável',
  attention: 'Atenção',
  critical: 'Crítico',
}

export const flagTone: Record<QualityFlag, Tone> = {
  ok: 'success',
  missing: 'warning',
  out_of_range: 'critical',
  spike: 'critical',
}
