// Motor de automação: avalia as regras por prioridade, resolve conflitos
// (bloqueios de proteção vencem aberturas), respeita o modo manual, aplica
// período de silêncio aos alertas e registra a justificativa de cada ação.

import type { FarmAnalysis } from '../analytics/analysis'
import { crops, plots } from '../domain/farm'
import type { PlatformEvent, ValveState } from '../domain/types'
import { automationRules, type AlertDecision, type AutomationRule } from './rules'

export interface RuleStats {
  triggers: number
  lastTriggered: number | null
}

export interface AutomationState {
  enabled: Record<string, boolean>
  stats: Record<string, RuleStats>
  /** Chave `regra:talhão` -> instante até o qual a notificação fica silenciada */
  cooldowns: Record<string, number>
}

export type AutomationEvent = Omit<PlatformEvent, 'id'>

export interface AutomationResult {
  valves: Record<string, ValveState>
  state: AutomationState
  events: AutomationEvent[]
}

const HOLD_LOG_COOLDOWN_HOURS = 4
const MANUAL_RECOMMENDATION_COOLDOWN_HOURS = 2

export function createAutomationState(rules: AutomationRule[] = automationRules): AutomationState {
  return {
    enabled: Object.fromEntries(rules.map((rule) => [rule.id, true])),
    stats: Object.fromEntries(rules.map((rule) => [rule.id, { triggers: 0, lastTriggered: null }])),
    cooldowns: {},
  }
}

export function createValves(): Record<string, ValveState> {
  return Object.fromEntries(
    plots.map((plot) => [plot.id, { open: false, mode: 'auto', openedAt: null, targetMoisture: null }]),
  )
}

export function runAutomation(
  analysis: FarmAnalysis,
  valves: Record<string, ValveState>,
  state: AutomationState,
  rules: AutomationRule[] = automationRules,
): AutomationResult {
  const timestamp = analysis.timestamp
  const nextValves = { ...valves }
  const stats = { ...state.stats }
  const cooldowns = { ...state.cooldowns }
  const events: AutomationEvent[] = []

  const trigger = (ruleId: string) => {
    stats[ruleId] = { triggers: (stats[ruleId]?.triggers ?? 0) + 1, lastTriggered: timestamp }
  }

  const passCooldown = (key: string, hours: number) => {
    if ((cooldowns[key] ?? 0) > timestamp) return false
    cooldowns[key] = timestamp + hours * 3_600_000
    return true
  }

  const emitAlert = (rule: AutomationRule, decision: AlertDecision, plotId?: string) => {
    if (!passCooldown(`${rule.id}:${plotId ?? 'fazenda'}`, decision.cooldownHours)) return
    trigger(rule.id)
    events.push({
      timestamp,
      severity: decision.severity,
      source: 'automacao',
      ruleId: rule.id,
      plotId,
      message: decision.message,
      detail: decision.detail,
    })
  }

  for (const rule of rules) {
    if (rule.scope !== 'farm' || !state.enabled[rule.id]) continue
    for (const decision of rule.evaluate({ analysis, timestamp })) emitAlert(rule, decision)
  }

  for (const plot of plots) {
    const crop = crops[plot.cropId]
    const result = analysis.plots[plot.id]
    let locked = false

    for (const rule of rules) {
      if (rule.scope !== 'plot' || !state.enabled[rule.id]) continue
      const valve = nextValves[plot.id]
      const decisions = rule.evaluate({ analysis, plot, crop, result, valve, timestamp })

      for (const decision of decisions) {
        if (decision.kind === 'alert') {
          emitAlert(rule, decision, plot.id)
          continue
        }

        if (valve.mode === 'manual') {
          // Em modo manual a automação apenas recomenda; o operador decide.
          const wantsChange = (decision.kind === 'open' && !valve.open) || (decision.kind === 'close' && valve.open)
          if (wantsChange && passCooldown(`${rule.id}:${plot.id}:manual`, MANUAL_RECOMMENDATION_COOLDOWN_HOURS)) {
            trigger(rule.id)
            events.push({
              timestamp,
              severity: 'info',
              source: 'automacao',
              ruleId: rule.id,
              plotId: plot.id,
              message: `Recomendação: ${decision.kind === 'open' ? 'abrir' : 'fechar'} a válvula (modo manual)`,
              detail: decision.reason,
            })
          }
          if (decision.kind !== 'open') locked = true
          continue
        }

        if (decision.kind === 'close') {
          locked = true
          if (valve.open) {
            nextValves[plot.id] = { ...valve, open: false, openedAt: null, targetMoisture: null }
            trigger(rule.id)
            events.push({
              timestamp,
              severity: 'info',
              source: 'automacao',
              ruleId: rule.id,
              plotId: plot.id,
              message: `Irrigação encerrada: ${rule.name.toLowerCase()}`,
              detail: decision.reason,
            })
          }
        } else if (decision.kind === 'hold') {
          locked = true
          if (passCooldown(`${rule.id}:${plot.id}`, HOLD_LOG_COOLDOWN_HOURS)) {
            trigger(rule.id)
            events.push({
              timestamp,
              severity: 'info',
              source: 'automacao',
              ruleId: rule.id,
              plotId: plot.id,
              message: 'Irrigação adiada',
              detail: decision.reason,
            })
          }
        } else if (!locked && !valve.open) {
          nextValves[plot.id] = { ...valve, open: true, openedAt: timestamp, targetMoisture: decision.target }
          trigger(rule.id)
          events.push({
            timestamp,
            severity: 'success',
            source: 'automacao',
            ruleId: rule.id,
            plotId: plot.id,
            message: 'Irrigação iniciada',
            detail: decision.reason,
          })
        }
      }
    }
  }

  return { valves: nextValves, state: { ...state, stats, cooldowns }, events }
}
