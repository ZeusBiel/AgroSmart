import { describe, expect, it } from 'vitest'
import { cropOf, plots } from '../domain/farm'
import { createPlatform, injectScenario, setValveMode, setValveOpen, stepPlatform } from './platform'

const NOW = Date.UTC(2026, 9, 10, 15, 0)

describe('plataforma integrada', () => {
  it('é determinística para a mesma semente', () => {
    const a = stepPlatform(createPlatform({ seed: 42, now: NOW, backfillTicks: 36 }), 36)
    const b = stepPlatform(createPlatform({ seed: 42, now: NOW, backfillTicks: 36 }), 36)
    expect(a.history.at(-1)).toEqual(b.history.at(-1))
    expect(a.events.length).toBe(b.events.length)
  })

  it('cada ciclo coleta 21 leituras e gera um registro organizado', () => {
    const state = createPlatform({ seed: 7, now: NOW, backfillTicks: 6 })
    expect(state.lastReadings).toHaveLength(5 + plots.length * 4)
    expect(state.history).toHaveLength(6)
  })

  it('mantém a umidade dos talhões na faixa da cultura durante 3 dias de operação automática', () => {
    const state = stepPlatform(createPlatform({ seed: 20260610, now: NOW }), 3 * 144)
    for (const plot of plots) {
      const { min } = cropOf(plot.id).moisture
      const values = state.history.map((record) => record.plots[plot.id].soilMoisture)
      const belowMin = values.filter((value) => value < min - 0.5).length / values.length
      expect(belowMin).toBeLessThan(0.02)
    }
    expect(state.automation.stats.R06.triggers).toBeGreaterThan(0)
    expect(state.automation.stats.R04.triggers).toBeGreaterThan(0)
  })

  it('responde a chuva forte suspendendo a irrigação e registrando a chuva', () => {
    let state = createPlatform({ seed: 3, now: NOW, backfillTicks: 144 })
    state = setValveMode(state, 'T1', 'manual')
    state = setValveOpen(state, 'T1', true)
    state = setValveMode(state, 'T1', 'auto')
    state = stepPlatform(injectScenario(state, 'heavyRain'), 6)
    expect(state.analysis.weather.rain24h).toBeGreaterThan(5)
    expect(state.valves.T1.open).toBe(false)
  })

  it('falha de sensor é imputada pelo pipeline e aciona o modo seguro', () => {
    let state = createPlatform({ seed: 11, now: NOW, backfillTicks: 144 })
    state = stepPlatform(injectScenario(state, 'sensorFault'), 4)
    expect(state.automation.stats.R01.triggers).toBeGreaterThan(0)
    expect(
      state.events.some((event) => event.source === 'pipeline' && event.message.includes('sem leituras válidas')),
    ).toBe(true)
  })
})
