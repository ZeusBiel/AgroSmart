import { describe, expect, it } from 'vitest'
import { createValves } from '../automation/engine'
import type { RawReading } from '../domain/types'
import { BASE_TIME } from '../test/fixtures'
import { createPipelineState, DEVICE_FAILURE_THRESHOLD, processReadings, validateReading } from './processing'

const reading = (value: number | null, overrides: Partial<RawReading> = {}): RawReading => ({
  deviceId: 'T1-UMI-01',
  sourceId: 'T1',
  sensor: 'soilMoisture',
  timestamp: BASE_TIME,
  value,
  ...overrides,
})

describe('validateReading', () => {
  it('classifica ausência, faixa física e picos', () => {
    const device = { lastValid: 30, consecutiveInvalid: 0 }
    expect(validateReading(reading(null), device)).toBe('missing')
    expect(validateReading(reading(75), device)).toBe('out_of_range')
    expect(validateReading(reading(45), device)).toBe('spike')
    expect(validateReading(reading(33), device)).toBe('ok')
  })

  it('amplia a tolerância a saltos depois de falhas seguidas (ressincronização)', () => {
    expect(validateReading(reading(45), { lastValid: 30, consecutiveInvalid: 0 })).toBe('spike')
    expect(validateReading(reading(45), { lastValid: 30, consecutiveInvalid: 1 })).toBe('ok')
  })

  it('rejeita radiação solar implausível durante a noite', () => {
    const night = Date.UTC(2026, 9, 10, 5, 0) // 02:00 em Brasília
    const radiation = { deviceId: 'EST-RAD-01', sourceId: 'estacao', sensor: 'solarRadiation' as const }
    expect(validateReading(reading(600, { ...radiation, timestamp: night }), undefined)).toBe('out_of_range')
    expect(validateReading(reading(600, { ...radiation, timestamp: BASE_TIME }), undefined)).toBe('ok')
  })
})

describe('processReadings', () => {
  it('imputa o último valor confiável e sinaliza falha e recuperação do dispositivo', () => {
    let state = createPipelineState()
    const valves = createValves()
    const events: string[] = []
    const values = [30, null, null, null, 30.4]

    const processed = values.map((value, index) => {
      const result = processReadings(state, [reading(value, { timestamp: BASE_TIME + index * 600_000 })], BASE_TIME, valves)
      state = result.state
      events.push(...result.events.map((event) => event.message))
      return result.validated[0]
    })

    expect(processed.map((r) => r.flag)).toEqual(['ok', 'missing', 'missing', 'missing', 'ok'])
    expect(processed[3].processed).toBe(30)
    expect(state.devices['T1-UMI-01'].consecutiveInvalid).toBe(0)
    expect(state.counters.soilMoisture).toMatchObject({ total: 5, ok: 2, missing: 3 })
    expect(events).toEqual([
      `Sensor T1-UMI-01 sem leituras válidas há 30 min`,
      'Sensor T1-UMI-01 restabelecido',
    ])
    expect(DEVICE_FAILURE_THRESHOLD).toBe(3)
  })

  it('suaviza com média móvel exponencial e organiza o registro por talhão', () => {
    let state = createPipelineState()
    const valves = createValves()
    state = processReadings(state, [reading(30)], BASE_TIME, valves).state
    const result = processReadings(state, [reading(32)], BASE_TIME + 600_000, valves)
    // MME com fator 0,6: 0,6 * 32 + 0,4 * 30 = 31,2
    expect(result.record.plots.T1.soilMoisture).toBe(31.2)
    expect(result.record.plots.T1.correctedReadings).toBe(0)
  })
})
