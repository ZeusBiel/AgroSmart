import type { FarmAnalysis, PlotAnalysis } from '../analytics/analysis'
import { cropOf, plots } from '../domain/farm'
import type { TickRecord, ValveState, WeatherSnapshot } from '../domain/types'

export const BASE_TIME = Date.UTC(2026, 9, 10, 12, 0) // 09:00 em Brasília

export function plotAnalysis(plotId: string, overrides: Partial<PlotAnalysis> = {}): PlotAnalysis {
  const crop = cropOf(plotId)
  return {
    plotId,
    moisture: crop.moisture.target,
    moistureTrend: 0,
    trendR2: 0,
    soilResponse: -1.6,
    forecastMethod: 'water-balance',
    forecast: [],
    hoursToMin: null,
    moistureStatus: 'ideal',
    soilTemperature: 24,
    soilPH: (crop.ph.min + crop.ph.max) / 2,
    phStatus: 'ok',
    heatStressHours: 0,
    water24h: { rainMm: 0, irrigationMm: 0, cropEtMm: 5, balanceMm: -5, irrigationM3: 0 },
    dataQuality: 100,
    moistureSensorFailing: false,
    health: { score: 100, status: 'good', components: { moisture: 100, ph: 100, thermal: 100, quality: 100 } },
    valveOpen: false,
    ...overrides,
  }
}

export const weather = (overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  airTemperature: 25,
  airHumidity: 60,
  solarRadiation: 600,
  rainfall: 0,
  windSpeed: 8,
  ...overrides,
})

export function farmAnalysis({
  hour = 9,
  timestamp = BASE_TIME,
  rainingNow = false,
  plots: plotOverrides = {},
  fungalRisk = 'low',
}: {
  hour?: number
  timestamp?: number
  rainingNow?: boolean
  plots?: Record<string, Partial<PlotAnalysis>>
  fungalRisk?: FarmAnalysis['weather']['fungalRisk']
} = {}): FarmAnalysis {
  return {
    timestamp,
    hour,
    weather: {
      current: weather(),
      rainLastHour: rainingNow ? 3 : 0,
      rain24h: rainingNow ? 3 : 0,
      rainingNow,
      et0Last24h: 5,
      airTemperatureRange: { min: 17, max: 29 },
      fungalRiskHours: fungalRisk === 'high' ? 8 : 0,
      fungalRisk,
    },
    plots: Object.fromEntries(plots.map((plot) => [plot.id, plotAnalysis(plot.id, plotOverrides[plot.id])])),
    kpis: {
      averageHealth: 100,
      averageMoistureGap: 0,
      plotsInIdealRange: 4,
      irrigation24hM3: 0,
      calendarBaselineM3: 0,
      savings24hM3: 0,
      savingsPct: 0,
    },
  }
}

export function valves(overrides: Record<string, Partial<ValveState>> = {}): Record<string, ValveState> {
  return Object.fromEntries(
    plots.map((plot) => [
      plot.id,
      { open: false, mode: 'auto', openedAt: null, targetMoisture: null, ...overrides[plot.id] },
    ]),
  ) as Record<string, ValveState>
}

/** Série temporal sintética para testes das análises. */
export function syntheticHistory(
  ticks: number,
  build: (index: number, timestamp: number) => { weather?: Partial<WeatherSnapshot>; moisture?: number; irrigation?: number },
): TickRecord[] {
  return Array.from({ length: ticks }, (_, index) => {
    const timestamp = BASE_TIME + index * 600_000
    const values = build(index, timestamp)
    return {
      timestamp,
      weather: weather(values.weather),
      plots: Object.fromEntries(
        plots.map((plot) => [
          plot.id,
          {
            soilMoisture: values.moisture ?? 30,
            soilTemperature: 24,
            soilPH: 6,
            irrigationVolume: values.irrigation ?? 0,
            valveOpen: false,
            correctedReadings: 0,
          },
        ]),
      ),
    }
  })
}
