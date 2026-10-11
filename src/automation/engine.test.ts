import { describe, expect, it } from 'vitest'
import { cropOf } from '../domain/farm'
import { BASE_TIME, farmAnalysis, valves } from '../test/fixtures'
import { createAutomationState, runAutomation } from './engine'

const soy = cropOf('T1').moisture
const dry = { moisture: soy.min - 1, moistureStatus: 'dry' as const, hoursToMin: 0 }

describe('motor de automação', () => {
  it('abre a válvula quando a umidade está abaixo do mínimo', () => {
    const result = runAutomation(farmAnalysis({ hour: 8, plots: { T1: dry } }), valves(), createAutomationState())
    expect(result.valves.T1).toMatchObject({ open: true, targetMoisture: soy.target })
    expect(result.events.find((event) => event.plotId === 'T1')?.ruleId).toBe('R06')
  })

  it('a chuva fecha válvulas e tem prioridade sobre a irrigação', () => {
    const analysis = farmAnalysis({ rainingNow: true, plots: { T1: dry } })
    const result = runAutomation(analysis, valves({ T2: { open: true, openedAt: BASE_TIME } }), createAutomationState())
    expect(result.valves.T1.open).toBe(false)
    expect(result.valves.T2.open).toBe(false)
    expect(result.state.stats.R02.triggers).toBe(1)
  })

  it('adia a irrigação no pico de evaporação, exceto em déficit crítico', () => {
    const deferred = runAutomation(farmAnalysis({ hour: 13, plots: { T1: dry } }), valves(), createAutomationState())
    expect(deferred.valves.T1.open).toBe(false)
    expect(deferred.events.find((event) => event.plotId === 'T1')?.ruleId).toBe('R05')

    const critical = farmAnalysis({ hour: 13, plots: { T1: { ...dry, moisture: soy.min - 3 } } })
    expect(runAutomation(critical, valves(), createAutomationState()).valves.T1.open).toBe(true)
  })

  it('antecipa a irrigação com lâmina calculada quando o mínimo cairia na janela térmica', () => {
    const forecast = Array.from({ length: 73 }, (_, step) => ({ t: BASE_TIME + step * 600_000, v: 28 - step * 0.15 }))
    const analysis = farmAnalysis({ hour: 9, plots: { T1: { moisture: 28, hoursToMin: 4.5, forecast } } })
    const result = runAutomation(analysis, valves(), createAutomationState())
    // Queda prevista até 15h: 36 passos x 0,15 = 5,4 p.p. -> meta = 24 + 5,4 + 2 de folga
    expect(result.valves.T1.open).toBe(true)
    expect(result.valves.T1.targetMoisture).toBeCloseTo(31.4, 1)
  })

  it('não liga a irrigação antecipada para ganhos menores que a lâmina mínima', () => {
    const forecast = Array.from({ length: 73 }, (_, step) => ({ t: BASE_TIME + step * 600_000, v: 30.8 - step * 0.12 }))
    const analysis = farmAnalysis({ hour: 9, plots: { T1: { moisture: 30.8, hoursToMin: 4, forecast } } })
    expect(runAutomation(analysis, valves(), createAutomationState()).valves.T1.open).toBe(false)
  })

  it('encerra a irrigação ao atingir a meta definida na abertura', () => {
    const analysis = farmAnalysis({ plots: { T1: { moisture: 33.5, valveOpen: true } } })
    const open = valves({ T1: { open: true, openedAt: BASE_TIME - 1_800_000, targetMoisture: 33 } })
    const result = runAutomation(analysis, open, createAutomationState())
    expect(result.valves.T1.open).toBe(false)
    expect(result.events[0].ruleId).toBe('R04')
  })

  it('em modo manual apenas recomenda, sem acionar a válvula', () => {
    const analysis = farmAnalysis({ hour: 8, plots: { T1: dry } })
    const result = runAutomation(analysis, valves({ T1: { mode: 'manual' } }), createAutomationState())
    expect(result.valves.T1.open).toBe(false)
    expect(result.events[0].message).toContain('Recomendação: abrir')
  })

  it('falha de sensor coloca o talhão em modo seguro com alerta silenciado por 2 h', () => {
    const analysis = farmAnalysis({ plots: { T1: { ...dry, moistureSensorFailing: true } } })
    const first = runAutomation(analysis, valves({ T1: { open: true, openedAt: BASE_TIME } }), createAutomationState())
    expect(first.valves.T1.open).toBe(false)
    expect(first.events.filter((event) => event.severity === 'critical')).toHaveLength(1)

    const later = runAutomation({ ...analysis, timestamp: BASE_TIME + 3_600_000 }, first.valves, first.state)
    expect(later.events.filter((event) => event.severity === 'critical')).toHaveLength(0)
    expect(later.valves.T1.open).toBe(false)
  })

  it('ignora regras desativadas', () => {
    const state = createAutomationState()
    state.enabled.R06 = false
    expect(runAutomation(farmAnalysis({ hour: 8, plots: { T1: dry } }), valves(), state).valves.T1.open).toBe(false)
  })
})
