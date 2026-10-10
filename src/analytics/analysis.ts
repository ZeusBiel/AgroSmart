// Camada 3 - Análises automatizadas.
// Transforma a série temporal processada em indicadores agronômicos por
// talhão (tendência, previsão, balanço hídrico, risco, saúde) e em
// recomendações priorizadas para o operador.

import { mmToCubicMeters, referenceEvapotranspiration } from '../domain/agronomy'
import {
  CALENDAR_IRRIGATION_MM_DAY,
  TICK_MS,
  TICKS_PER_HOUR,
  crops,
  cropOf,
  deviceId,
  plotById,
  plots,
} from '../domain/farm'
import type { Severity, TickRecord, WeatherSnapshot } from '../domain/types'
import { formatHours, formatNumber, formatSigned } from '../lib/format'
import { hourOfDay } from '../lib/time'
import { DEVICE_FAILURE_THRESHOLD, type PipelineState } from '../pipeline/processing'
import { lastHours, sumOf } from '../pipeline/timeSeries'
import { hoursUntilThreshold, linearTrend } from './statistics'

export type MoistureStatus = 'dry' | 'low' | 'ideal' | 'wet'
export type RiskLevel = 'low' | 'medium' | 'high'
export type HealthStatus = 'good' | 'attention' | 'critical'

export interface PlotAnalysis {
  plotId: string
  moisture: number
  /** Variação da umidade em pontos percentuais por hora (últimas 3 h) */
  moistureTrend: number
  trendR2: number
  /** Resposta do solo calibrada pelos dados: p.p. de umidade por mm de ETc */
  soilResponse: number
  forecastMethod: 'water-balance' | 'trend'
  /** Umidade projetada para as próximas 12 h */
  forecast: Array<{ t: number; v: number }>
  hoursToMin: number | null
  moistureStatus: MoistureStatus
  soilTemperature: number
  soilPH: number
  phStatus: 'low' | 'ok' | 'high'
  heatStressHours: number
  water24h: {
    rainMm: number
    irrigationMm: number
    cropEtMm: number
    balanceMm: number
    irrigationM3: number
  }
  dataQuality: number
  moistureSensorFailing: boolean
  health: {
    score: number
    status: HealthStatus
    components: { moisture: number; ph: number; thermal: number; quality: number }
  }
  valveOpen: boolean
}

export interface WeatherAnalysis {
  current: WeatherSnapshot
  rainLastHour: number
  rain24h: number
  rainingNow: boolean
  et0Last24h: number
  airTemperatureRange: { min: number; max: number }
  fungalRiskHours: number
  fungalRisk: RiskLevel
}

export interface FarmAnalysis {
  timestamp: number
  hour: number
  weather: WeatherAnalysis
  plots: Record<string, PlotAnalysis>
  kpis: {
    averageHealth: number
    averageMoistureGap: number
    plotsInIdealRange: number
    irrigation24hM3: number
    calendarBaselineM3: number
    savings24hM3: number
    savingsPct: number
  }
}

export interface Insight {
  id: string
  severity: Severity
  plotId?: string
  title: string
  detail: string
  action: string
}

const TREND_WINDOW_HOURS = 3
const FORECAST_HOURS = 12
const TICKS_PER_DAY = 24 * TICKS_PER_HOUR
/** Resposta padrão (p.p./mm) enquanto não há dados suficientes para calibrar */
const DEFAULT_SOIL_RESPONSE = -1.5
export const THERMAL_WINDOW = { start: 11, end: 15 }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function analyzeWeather(history: TickRecord[]): WeatherAnalysis {
  const day = lastHours(history, 24)
  const hour = lastHours(history, 1)
  const halfHour = lastHours(history, 0.5)
  const current = history[history.length - 1].weather

  const temperatures = day.map((record) => record.weather.airTemperature)
  const fungalTicks = day.filter(
    ({ weather }) => weather.airHumidity >= 85 && weather.airTemperature >= 18 && weather.airTemperature <= 28,
  ).length
  const fungalRiskHours = fungalTicks / TICKS_PER_HOUR

  return {
    current,
    rainLastHour: sumOf(hour.map((record) => record.weather.rainfall)),
    rain24h: sumOf(day.map((record) => record.weather.rainfall)),
    rainingNow: sumOf(halfHour.map((record) => record.weather.rainfall)) >= 0.4,
    et0Last24h: sumOf(
      day.map((record) =>
        referenceEvapotranspiration(record.weather.airTemperature, record.weather.solarRadiation),
      ),
    ),
    airTemperatureRange: { min: Math.min(...temperatures), max: Math.max(...temperatures) },
    fungalRiskHours,
    fungalRisk: fungalRiskHours >= 6 ? 'high' : fungalRiskHours >= 3 ? 'medium' : 'low',
  }
}

function moistureStatus(plotId: string, moisture: number): MoistureStatus {
  const { min, target, max } = cropOf(plotId).moisture
  if (moisture < min) return 'dry'
  if (moisture > max) return 'wet'
  if (moisture < (min + target) / 2) return 'low'
  return 'ideal'
}

export function healthScore(input: {
  plotId: string
  moisture: number
  soilPH: number
  heatStressHours: number
  dataQuality: number
}): PlotAnalysis['health'] {
  const crop = cropOf(input.plotId)
  const { min, max } = crop.moisture
  const moisture =
    input.moisture < min
      ? 100 - (min - input.moisture) * 12
      : input.moisture > max
        ? 100 - (input.moisture - max) * 8
        : 100
  const phDistance =
    input.soilPH < crop.ph.min
      ? crop.ph.min - input.soilPH
      : input.soilPH > crop.ph.max
        ? input.soilPH - crop.ph.max
        : 0
  const components = {
    moisture: clamp(moisture, 0, 100),
    ph: clamp(100 - phDistance * 80, 0, 100),
    thermal: clamp(100 - input.heatStressHours * 12, 0, 100),
    quality: clamp(((input.dataQuality - 80) / 20) * 100, 0, 100),
  }
  const score = Math.round(
    components.moisture * 0.45 + components.ph * 0.2 + components.thermal * 0.15 + components.quality * 0.2,
  )
  return { score, components, status: score >= 80 ? 'good' : score >= 60 ? 'attention' : 'critical' }
}

const tickEt0 = (record: TickRecord) =>
  referenceEvapotranspiration(record.weather.airTemperature, record.weather.solarRadiation)

/**
 * Calibra quanto a umidade cai por mm de evapotranspiração da cultura,
 * usando regressão pela origem nos ciclos das últimas 24 h sem chuva nem
 * irrigação recentes (que mascarariam a secagem do solo).
 */
export function estimateSoilResponse(history: TickRecord[], plotId: string) {
  const kc = cropOf(plotId).kc
  const start = Math.max(1, history.length - TICKS_PER_DAY)
  let sxy = 0
  let sxx = 0
  let samples = 0

  for (let i = start; i < history.length; i++) {
    let wet = false
    for (let j = Math.max(0, i - TICKS_PER_HOUR); j <= i && !wet; j++) {
      wet = history[j].weather.rainfall > 0 || history[j].plots[plotId].irrigationVolume > 0
    }
    if (wet) continue
    const x = tickEt0(history[i]) * kc
    const y = history[i].plots[plotId].soilMoisture - history[i - 1].plots[plotId].soilMoisture
    sxy += x * y
    sxx += x * x
    samples += 1
  }

  if (samples < 4 * TICKS_PER_HOUR || sxx === 0) return DEFAULT_SOIL_RESPONSE
  return clamp(sxy / sxx, -4, -0.3)
}

/**
 * Projeta a umidade das próximas horas por balanço hídrico: a demanda
 * atmosférica futura é estimada por persistência (ET0 medida no mesmo
 * horário do dia anterior) e convertida em umidade pela resposta calibrada.
 */
export function forecastMoisture(history: TickRecord[], plotId: string, soilResponse: number) {
  const latest = history[history.length - 1]
  const kc = cropOf(plotId).kc
  const steps = FORECAST_HOURS * TICKS_PER_HOUR
  const points: Array<{ t: number; v: number }> = [{ t: latest.timestamp, v: latest.plots[plotId].soilMoisture }]

  if (history.length < TICKS_PER_DAY) {
    return { method: 'trend' as const, points }
  }

  let moisture = latest.plots[plotId].soilMoisture
  for (let step = 1; step <= steps; step++) {
    const sameTimeYesterday = history[history.length - TICKS_PER_DAY + step - 1]
    moisture += soilResponse * tickEt0(sameTimeYesterday) * kc
    points.push({ t: latest.timestamp + step * TICK_MS, v: moisture })
  }
  return { method: 'water-balance' as const, points }
}

function forecastHoursToMin(current: number, points: Array<{ t: number; v: number }>, now: number, min: number) {
  if (current <= min) return 0
  const crossing = points.find((point) => point.v < min)
  return crossing ? (crossing.t - now) / 3_600_000 : null
}

function analyzePlot(history: TickRecord[], pipeline: PipelineState, plotId: string): PlotAnalysis {
  const crop = cropOf(plotId)
  const plot = plotById[plotId]
  const latest = history[history.length - 1]
  const snapshot = latest.plots[plotId]
  const day = lastHours(history, 24)

  const trendWindow = lastHours(history, TREND_WINDOW_HOURS)
  const trend = linearTrend(
    trendWindow.map((record) => ({
      x: (record.timestamp - latest.timestamp) / 3_600_000,
      y: record.plots[plotId].soilMoisture,
    })),
  )

  const soilResponse = estimateSoilResponse(history, plotId)
  const forecast = forecastMoisture(history, plotId, soilResponse)
  const hoursToMin =
    forecast.method === 'water-balance'
      ? forecastHoursToMin(snapshot.soilMoisture, forecast.points, latest.timestamp, crop.moisture.min)
      : hoursUntilThreshold(snapshot.soilMoisture, trend.slope, crop.moisture.min)

  const rainMm = sumOf(day.map((record) => record.weather.rainfall))
  const irrigationMm = sumOf(day.map((record) => record.plots[plotId].irrigationVolume))
  const cropEtMm = sumOf(
    day.map(
      (record) =>
        referenceEvapotranspiration(record.weather.airTemperature, record.weather.solarRadiation) * crop.kc,
    ),
  )

  const heatStressHours =
    day.filter((record) => record.weather.airTemperature > crop.airTemperature.max).length / TICKS_PER_HOUR

  const corrected = sumOf(day.map((record) => record.plots[plotId].correctedReadings))
  const dataQuality = 100 * (1 - corrected / Math.max(1, day.length * 4))

  const moistureDevice = pipeline.devices[deviceId(plotId, 'soilMoisture')]
  const moistureSensorFailing = (moistureDevice?.consecutiveInvalid ?? 0) >= DEVICE_FAILURE_THRESHOLD

  return {
    plotId,
    moisture: snapshot.soilMoisture,
    moistureTrend: trend.slope,
    trendR2: trend.r2,
    soilResponse,
    forecastMethod: forecast.method,
    forecast: forecast.points,
    hoursToMin,
    moistureStatus: moistureStatus(plotId, snapshot.soilMoisture),
    soilTemperature: snapshot.soilTemperature,
    soilPH: snapshot.soilPH,
    phStatus: snapshot.soilPH < crop.ph.min ? 'low' : snapshot.soilPH > crop.ph.max ? 'high' : 'ok',
    heatStressHours,
    water24h: {
      rainMm,
      irrigationMm,
      cropEtMm,
      balanceMm: rainMm + irrigationMm - cropEtMm,
      irrigationM3: mmToCubicMeters(irrigationMm, plot.areaHa),
    },
    dataQuality,
    moistureSensorFailing,
    health: healthScore({
      plotId,
      moisture: snapshot.soilMoisture,
      soilPH: snapshot.soilPH,
      heatStressHours,
      dataQuality,
    }),
    valveOpen: snapshot.valveOpen,
  }
}

export function analyzeFarm(history: TickRecord[], pipeline: PipelineState): FarmAnalysis {
  const latest = history[history.length - 1]
  const plotAnalyses = Object.fromEntries(
    plots.map((plot) => [plot.id, analyzePlot(history, pipeline, plot.id)]),
  )
  const list = Object.values(plotAnalyses)

  const coveredDays = Math.min(24, history.length / TICKS_PER_HOUR) / 24
  const irrigation24hM3 = sumOf(list.map((analysis) => analysis.water24h.irrigationM3))
  const calendarBaselineM3 = sumOf(
    plots.map((plot) => mmToCubicMeters(CALENDAR_IRRIGATION_MM_DAY * coveredDays, plot.areaHa)),
  )
  const savings24hM3 = calendarBaselineM3 - irrigation24hM3

  return {
    timestamp: latest.timestamp,
    hour: hourOfDay(latest.timestamp),
    weather: analyzeWeather(history),
    plots: plotAnalyses,
    kpis: {
      averageHealth: Math.round(sumOf(list.map((analysis) => analysis.health.score)) / list.length),
      averageMoistureGap:
        sumOf(list.map((analysis) => analysis.moisture - cropOf(analysis.plotId).moisture.target)) / list.length,
      plotsInIdealRange: list.filter((analysis) => analysis.moistureStatus !== 'dry' && analysis.moistureStatus !== 'wet')
        .length,
      irrigation24hM3,
      calendarBaselineM3,
      savings24hM3,
      savingsPct: calendarBaselineM3 > 0 ? (savings24hM3 / calendarBaselineM3) * 100 : 0,
    },
  }
}

const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2, success: 3 }

const inThermalWindow = (hour: number) => hour >= THERMAL_WINDOW.start && hour < THERMAL_WINDOW.end

/** Gera recomendações em linguagem natural, ordenadas por prioridade. */
export function buildInsights(analysis: FarmAnalysis): Insight[] {
  const insights: Insight[] = []
  const { weather, kpis } = analysis

  for (const plot of plots) {
    const result = analysis.plots[plot.id]
    const crop = crops[plot.cropId]
    const label = `${plot.name} · ${crop.name}`

    if (result.moistureSensorFailing) {
      insights.push({
        id: `${plot.id}-sensor`,
        severity: 'critical',
        plotId: plot.id,
        title: `${label}: sensor de umidade sem resposta`,
        detail: 'A irrigação automática do talhão foi colocada em modo seguro (válvula fechada).',
        action: `Enviar equipe para inspecionar ${deviceId(plot.id, 'soilMoisture')} e o gateway LoRa.`,
      })
    } else if (result.moistureStatus === 'dry') {
      insights.push({
        id: `${plot.id}-dry`,
        severity: 'critical',
        plotId: plot.id,
        title: `${label} abaixo da umidade mínima`,
        detail: `Umidade em ${formatNumber(result.moisture)}% (mínimo ${crop.moisture.min}%).`,
        action: result.valveOpen
          ? 'Irrigação em andamento até a meta de umidade.'
          : 'Acionar irrigação ou verificar se o talhão está em modo manual.',
      })
    } else if (result.hoursToMin !== null && result.hoursToMin <= 6) {
      const deferred = inThermalWindow(analysis.hour) && result.hoursToMin > 0
      insights.push({
        id: `${plot.id}-forecast`,
        severity: 'warning',
        plotId: plot.id,
        title: `${label} atinge a umidade mínima em ~${formatHours(result.hoursToMin)}`,
        detail:
          result.forecastMethod === 'water-balance'
            ? `Previsão por balanço hídrico com a demanda de ontem no mesmo horário (resposta do solo ${formatNumber(result.soilResponse, 2)} p.p./mm).`
            : `Tendência de ${formatSigned(result.moistureTrend, 2)} p.p./h nas últimas 3 h (R² ${formatNumber(result.trendR2, 2)}).`,
        action: deferred
          ? 'Irrigação adiada para depois das 15h, fora do pico de evaporação.'
          : 'A irrigação preditiva será acionada a 2 h do limite (ou antes das 11h, se o limite cair no pico de evaporação).',
      })
    } else if (result.moistureStatus === 'wet') {
      insights.push({
        id: `${plot.id}-wet`,
        severity: 'warning',
        plotId: plot.id,
        title: `${label} com excesso hídrico`,
        detail: `Umidade em ${formatNumber(result.moisture)}% (máximo ${crop.moisture.max}%).`,
        action: 'Irrigação bloqueada. Monitorar drenagem e risco de doenças radiculares.',
      })
    }

    if (result.phStatus !== 'ok') {
      const low = result.phStatus === 'low'
      insights.push({
        id: `${plot.id}-ph`,
        severity: 'info',
        plotId: plot.id,
        title: `${label}: pH ${formatNumber(result.soilPH, 2)} ${low ? 'abaixo' : 'acima'} da faixa ideal`,
        detail: `Faixa recomendada para ${crop.name.toLowerCase()}: ${formatNumber(crop.ph.min)}–${formatNumber(crop.ph.max)}.`,
        action: low
          ? 'Programar análise de solo e calagem (calcário dolomítico) antes do próximo ciclo.'
          : 'Avaliar adubação acidificante ou aplicação de enxofre elementar.',
      })
    }

    if (result.heatStressHours >= 1) {
      insights.push({
        id: `${plot.id}-heat`,
        severity: 'warning',
        plotId: plot.id,
        title: `${label}: estresse térmico`,
        detail: `${formatHours(result.heatStressHours)} acima de ${crop.airTemperature.max} °C nas últimas 24 h.`,
        action: 'Manter a umidade próxima da meta e priorizar irrigação no fim da tarde.',
      })
    }

    if (!result.moistureSensorFailing && result.dataQuality < 97) {
      insights.push({
        id: `${plot.id}-quality`,
        severity: 'info',
        plotId: plot.id,
        title: `${label}: qualidade de dados em ${formatNumber(result.dataQuality, 0)}%`,
        detail: 'Leituras corrigidas pelo pipeline (ausentes, picos ou fora da faixa) nas últimas 24 h.',
        action: 'Verificar calibração e alimentação dos sensores do talhão.',
      })
    }
  }

  if (weather.fungalRisk !== 'low') {
    const diseases = plots.map((plot) => `${crops[plot.cropId].fungalDisease} (${crops[plot.cropId].name.toLowerCase()})`)
    insights.push({
      id: 'fungal-risk',
      severity: weather.fungalRisk === 'high' ? 'warning' : 'info',
      title: `Risco ${weather.fungalRisk === 'high' ? 'alto' : 'moderado'} de doenças fúngicas`,
      detail: `${formatHours(weather.fungalRiskHours)} com umidade do ar ≥ 85% e temperatura entre 18 e 28 °C nas últimas 24 h.`,
      action: `Inspecionar sinais de ${diseases.join(', ')} e avaliar fungicida preventivo.`,
    })
  }

  if (weather.rain24h >= 5) {
    insights.push({
      id: 'rain',
      severity: 'success',
      title: `Chuva de ${formatNumber(weather.rain24h)} mm nas últimas 24 h`,
      detail: 'A reposição natural de água reduziu a necessidade de irrigação.',
      action: 'A automação suspende a irrigação durante a chuva e retoma pela umidade medida.',
    })
  }

  if (kpis.savings24hM3 > 0) {
    insights.push({
      id: 'savings',
      severity: 'success',
      title: `Economia de ${formatNumber(kpis.savingsPct, 0)}% de água nas últimas 24 h`,
      detail: `${formatNumber(kpis.irrigation24hM3, 0)} m³ aplicados contra ${formatNumber(kpis.calendarBaselineM3, 0)} m³ de uma irrigação fixa de ${CALENDAR_IRRIGATION_MM_DAY} mm/dia.`,
      action: 'Manter a irrigação orientada por umidade do solo e evapotranspiração.',
    })
  }

  if (!insights.some((insight) => insight.severity === 'critical' || insight.severity === 'warning')) {
    insights.push({
      id: 'all-good',
      severity: 'success',
      title: 'Todos os talhões dentro da faixa de umidade',
      detail: `${kpis.plotsInIdealRange} de ${plots.length} talhões entre o mínimo e o máximo da cultura.`,
      action: 'Nenhuma intervenção necessária no momento.',
    })
  }

  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
}
