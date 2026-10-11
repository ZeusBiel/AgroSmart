import { describe, expect, it } from 'vitest'
import { referenceEvapotranspiration } from '../domain/agronomy'
import { cropOf } from '../domain/farm'
import { createPipelineState } from '../pipeline/processing'
import { syntheticHistory } from '../test/fixtures'
import { analyzeFarm, buildInsights, estimateSoilResponse, forecastMoisture, healthScore } from './analysis'
import { describe as describeValues, hoursUntilThreshold, linearTrend } from './statistics'

describe('estatística', () => {
  it('ajusta a reta exata de dados lineares', () => {
    const trend = linearTrend([0, 1, 2, 3].map((x) => ({ x, y: 10 - 2 * x })))
    expect(trend.slope).toBeCloseTo(-2)
    expect(trend.intercept).toBeCloseTo(10)
    expect(trend.r2).toBeCloseTo(1)
  })

  it('estima horas até o limite apenas com tendência de queda', () => {
    expect(hoursUntilThreshold(30, -2, 24)).toBe(3)
    expect(hoursUntilThreshold(30, 0.5, 24)).toBeNull()
    expect(hoursUntilThreshold(23, -1, 24)).toBe(0)
  })

  it('calcula estatística descritiva', () => {
    expect(describeValues([2, 4, 4, 4, 5, 5, 7, 9])).toMatchObject({ min: 2, max: 9, mean: 5, stdDev: 2, last: 9 })
  })
})

describe('índice de saúde', () => {
  it('é 100 com todas as variáveis na faixa e penaliza solo seco', () => {
    const crop = cropOf('T1')
    const ideal = healthScore({ plotId: 'T1', moisture: crop.moisture.target, soilPH: 6, heatStressHours: 0, dataQuality: 100 })
    const dry = healthScore({ plotId: 'T1', moisture: crop.moisture.min - 5, soilPH: 6, heatStressHours: 0, dataQuality: 100 })
    expect(ideal.score).toBe(100)
    expect(ideal.status).toBe('good')
    expect(dry.components.moisture).toBe(40)
    expect(dry.status).toBe('attention')
  })
})

describe('previsão por balanço hídrico', () => {
  // Solo sintético que perde exatamente 1,7 p.p. por mm de ETc
  const kc = cropOf('T1').kc
  let moisture = 38
  const history = syntheticHistory(24 * 6 + 1, (index) => {
    const hour = (9 + index / 6) % 24
    const radiation = hour > 6 && hour < 18 ? 900 * Math.sin((Math.PI * (hour - 6)) / 12) : 0
    if (index > 0) moisture -= 1.7 * referenceEvapotranspiration(26, radiation) * kc
    return { weather: { airTemperature: 26, solarRadiation: radiation }, moisture }
  })

  it('calibra a resposta do solo a partir dos dados', () => {
    expect(estimateSoilResponse(history, 'T1')).toBeCloseTo(-1.7, 1)
  })

  it('projeta a umidade das próximas 12 h com a demanda do dia anterior', () => {
    const forecast = forecastMoisture(history, 'T1', -1.7)
    expect(forecast.method).toBe('water-balance')
    expect(forecast.points).toHaveLength(12 * 6 + 1)
    const last = history[history.length - 1].plots.T1.soilMoisture
    expect(forecast.points[forecast.points.length - 1].v).toBeLessThan(last)
  })
})

describe('analyzeFarm e recomendações', () => {
  it('detecta risco fúngico alto e recomenda inspeção', () => {
    const humid = syntheticHistory(24 * 6, () => ({ weather: { airHumidity: 92, airTemperature: 22, solarRadiation: 200 } }))
    const analysis = analyzeFarm(humid, createPipelineState())
    expect(analysis.weather.fungalRisk).toBe('high')
    expect(buildInsights(analysis).some((insight) => insight.id === 'fungal-risk')).toBe(true)
  })

  it('converte lâmina irrigada em volume (1 mm em 1 ha = 10 m³)', () => {
    const irrigated = syntheticHistory(6, () => ({ irrigation: 1 }))
    const analysis = analyzeFarm(irrigated, createPipelineState())
    expect(analysis.plots.T1.water24h.irrigationMm).toBe(6)
    expect(analysis.plots.T1.water24h.irrigationM3).toBe(6 * 42 * 10)
  })
})
