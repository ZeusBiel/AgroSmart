// Orquestrador da plataforma: integra as camadas em um ciclo único e puro.
//   1. Coleta      - simulador IoT gera os pacotes dos sensores
//   2. Processamento - pipeline valida, corrige e organiza a série temporal
//   3. Análise     - indicadores agronômicos e recomendações
//   4. Automação   - regras acionam válvulas e alertas
// O estado resultante alimenta a camada de visualização (React).

import { analyzeFarm, buildInsights, type FarmAnalysis, type Insight } from '../analytics/analysis'
import { createAutomationState, createValves, runAutomation, type AutomationState } from '../automation/engine'
import { automationRules } from '../automation/rules'
import { BACKFILL_TICKS, TICK_MS, plotById } from '../domain/farm'
import type {
  PlatformEvent,
  ScenarioKind,
  TickRecord,
  ValidatedReading,
  ValveMode,
  ValveState,
} from '../domain/types'
import { applyScenario, createSimulatorState, stepSimulator, type SimulatorState } from '../iot/simulator'
import { createPipelineState, processReadings, type PipelineState } from '../pipeline/processing'
import { appendRecord } from '../pipeline/timeSeries'

export interface PlatformState {
  seed: number
  time: number
  tick: number
  simulator: SimulatorState
  pipeline: PipelineState
  history: TickRecord[]
  lastReadings: ValidatedReading[]
  analysis: FarmAnalysis
  insights: Insight[]
  valves: Record<string, ValveState>
  automation: AutomationState
  events: PlatformEvent[]
  eventCounter: number
}

const EVENT_RETENTION = 250

type NewEvent = Omit<PlatformEvent, 'id'>

function withEvents(state: PlatformState, newEvents: NewEvent[]): Pick<PlatformState, 'events' | 'eventCounter'> {
  if (newEvents.length === 0) return { events: state.events, eventCounter: state.eventCounter }
  let counter = state.eventCounter
  const stamped = newEvents.map((event) => ({ ...event, id: `evt-${++counter}` })).reverse()
  return { events: [...stamped, ...state.events].slice(0, EVENT_RETENTION), eventCounter: counter }
}

type CoreState = Omit<PlatformState, 'analysis' | 'insights'> & Partial<Pick<PlatformState, 'analysis' | 'insights'>>

function advance(state: CoreState): PlatformState {
  const time = state.time + TICK_MS
  const simulation = stepSimulator(state.simulator, time, state.valves)
  const processed = processReadings(state.pipeline, simulation.readings, time, state.valves)
  const history = appendRecord(state.history, processed.record)
  const analysis = analyzeFarm(history, processed.state)
  const automation = runAutomation(analysis, state.valves, state.automation, automationRules)

  const base: PlatformState = {
    ...state,
    time,
    tick: state.tick + 1,
    simulator: simulation.state,
    pipeline: processed.state,
    history,
    lastReadings: processed.validated,
    analysis,
    insights: buildInsights(analysis),
    valves: automation.valves,
    automation: automation.state,
  }

  return { ...base, ...withEvents(base, [...processed.events, ...automation.events]) }
}

export function createPlatform({
  seed = 20260610,
  now = Date.now(),
  backfillTicks = BACKFILL_TICKS,
}: { seed?: number; now?: number; backfillTicks?: number } = {}): PlatformState {
  const end = Math.floor(now / TICK_MS) * TICK_MS
  const start = end - Math.max(1, backfillTicks) * TICK_MS

  let state = advance({
    seed,
    time: start,
    tick: 0,
    simulator: createSimulatorState(seed, start),
    pipeline: createPipelineState(),
    history: [],
    lastReadings: [],
    valves: createValves(),
    automation: createAutomationState(),
    events: [],
    eventCounter: 0,
  })

  for (let i = 1; i < backfillTicks; i++) state = advance(state)

  const started: NewEvent = {
    timestamp: state.time,
    severity: 'info',
    source: 'simulacao',
    message: 'Plataforma AgroSmart iniciada',
    detail: `${backfillTicks} ciclos de histórico gerados (${Math.round(backfillTicks / 6)} h de dados).`,
  }
  return { ...state, ...withEvents(state, [started]) }
}

export function stepPlatform(state: PlatformState, ticks = 1): PlatformState {
  let next = state
  for (let i = 0; i < ticks; i++) next = advance(next)
  return next
}

export function setValveMode(state: PlatformState, plotId: string, mode: ValveMode): PlatformState {
  const valve = state.valves[plotId]
  if (!valve || valve.mode === mode) return state
  const valves = { ...state.valves, [plotId]: { ...valve, mode } }
  return {
    ...state,
    valves,
    ...withEvents(state, [
      {
        timestamp: state.time,
        severity: 'info',
        source: 'operador',
        plotId,
        message: `${plotById[plotId].name} em modo ${mode === 'auto' ? 'automático' : 'manual'}`,
        detail:
          mode === 'auto'
            ? 'As regras de automação voltam a controlar a válvula.'
            : 'A automação passa a apenas recomendar ações para este talhão.',
      },
    ]),
  }
}

export function setValveOpen(state: PlatformState, plotId: string, open: boolean): PlatformState {
  const valve = state.valves[plotId]
  if (!valve || valve.mode !== 'manual' || valve.open === open) return state
  const valves = {
    ...state.valves,
    [plotId]: { ...valve, open, openedAt: open ? state.time : null, targetMoisture: null },
  }
  return {
    ...state,
    valves,
    ...withEvents(state, [
      {
        timestamp: state.time,
        severity: 'info',
        source: 'operador',
        plotId,
        message: `Válvula do ${plotById[plotId].name} ${open ? 'aberta' : 'fechada'} manualmente`,
      },
    ]),
  }
}

export function toggleRule(state: PlatformState, ruleId: string): PlatformState {
  const rule = automationRules.find((candidate) => candidate.id === ruleId)
  if (!rule) return state
  const enabled = !state.automation.enabled[ruleId]
  return {
    ...state,
    automation: { ...state.automation, enabled: { ...state.automation.enabled, [ruleId]: enabled } },
    ...withEvents(state, [
      {
        timestamp: state.time,
        severity: enabled ? 'info' : 'warning',
        source: 'operador',
        ruleId,
        message: `Regra ${rule.id} ${enabled ? 'ativada' : 'desativada'}`,
        detail: rule.name,
      },
    ]),
  }
}

export function injectScenario(state: PlatformState, kind: ScenarioKind): PlatformState {
  const { state: simulator, detail } = applyScenario(state.simulator, kind)
  return {
    ...state,
    simulator,
    ...withEvents(state, [
      {
        timestamp: state.time,
        severity: kind === 'sensorFault' ? 'warning' : 'info',
        source: 'simulacao',
        message: 'Evento ambiental injetado',
        detail,
      },
    ]),
  }
}
