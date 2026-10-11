import { useEffect, useReducer, useState } from 'react'
import type { ScenarioKind, ValveMode } from '../domain/types'
import {
  createPlatform,
  injectScenario,
  setValveMode,
  setValveOpen,
  stepPlatform,
  toggleRule,
  type PlatformState,
} from './platform'

export type PlatformAction =
  | { type: 'tick'; ticks: number }
  | { type: 'toggleRule'; ruleId: string }
  | { type: 'setValveMode'; plotId: string; mode: ValveMode }
  | { type: 'setValveOpen'; plotId: string; open: boolean }
  | { type: 'scenario'; kind: ScenarioKind }
  | { type: 'reset' }

/** Velocidades da simulação: ciclos de 10 min processados por segundo real */
export const SPEEDS = [
  { ticks: 1, label: '10 min/s' },
  { ticks: 6, label: '1 h/s' },
  { ticks: 36, label: '6 h/s' },
] as const

function reducer(state: PlatformState, action: PlatformAction): PlatformState {
  switch (action.type) {
    case 'tick':
      return stepPlatform(state, action.ticks)
    case 'toggleRule':
      return toggleRule(state, action.ruleId)
    case 'setValveMode':
      return setValveMode(state, action.plotId, action.mode)
    case 'setValveOpen':
      return setValveOpen(state, action.plotId, action.open)
    case 'scenario':
      return injectScenario(state, action.kind)
    case 'reset':
      return createPlatform({ seed: Math.floor(Math.random() * 2 ** 31) })
  }
}

export function usePlatform() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createPlatform())
  const [running, setRunning] = useState(true)
  const [speed, setSpeed] = useState<number>(SPEEDS[0].ticks)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => dispatch({ type: 'tick', ticks: speed }), 1000)
    return () => window.clearInterval(id)
  }, [running, speed])

  return { state, dispatch, running, setRunning, speed, setSpeed }
}
