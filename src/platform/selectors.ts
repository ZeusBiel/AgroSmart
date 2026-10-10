// Derivações da série temporal usadas pela camada de visualização.

import { describe } from '../analytics/statistics'
import { TICK_MS, sensorSpecs } from '../domain/farm'
import type { PlotSnapshot, TickRecord, WeatherSnapshot } from '../domain/types'
import { formatDateTime, formatTime } from '../lib/format'
import { bucketize, lastHours, sumOf } from '../pipeline/timeSeries'

type PlotField = 'soilMoisture' | 'soilTemperature' | 'soilPH'

export const plotSeries = (history: TickRecord[], plotId: string, field: PlotField) =>
  history.map((record) => ({ t: record.timestamp, v: record.plots[plotId][field] }))

export const weatherSeries = (history: TickRecord[], field: keyof WeatherSnapshot) =>
  history.map((record) => ({ t: record.timestamp, v: record.weather[field] }))

/** Períodos contínuos em que o hidrômetro registrou irrigação. */
export function irrigationSpans(history: TickRecord[], plotId: string) {
  const spans: Array<{ start: number; end: number }> = []
  for (const record of history) {
    if (record.plots[plotId].irrigationVolume <= 0) continue
    const last = spans[spans.length - 1]
    const start = record.timestamp - TICK_MS
    if (last && last.end >= start) last.end = record.timestamp
    else spans.push({ start, end: record.timestamp })
  }
  return spans
}

/** Entradas de água (chuva e irrigação) agregadas em intervalos. */
export function waterBuckets(history: TickRecord[], plotId: string, bucketHours: number) {
  return bucketize(history, bucketHours, (records) => ({
    rain: sumOf(records.map((record) => record.weather.rainfall)),
    irrigation: sumOf(records.map((record) => record.plots[plotId].irrigationVolume)),
  })).map((bucket) => ({
    key: String(bucket.start),
    label: `${formatTime(bucket.start).slice(0, 2)}h`,
    tooltipLabel: `${formatDateTime(bucket.start)} – ${formatTime(bucket.end)}`,
    values: [bucket.value.rain, bucket.value.irrigation],
  }))
}

const plotStatFields: Array<keyof Pick<PlotSnapshot, PlotField>> = ['soilMoisture', 'soilTemperature', 'soilPH']
const weatherStatFields: Array<keyof WeatherSnapshot> = ['airTemperature', 'airHumidity', 'solarRadiation', 'windSpeed']

/** Estatística descritiva das variáveis do talhão e da estação na janela. */
export function windowStatistics(history: TickRecord[], plotId: string, hours: number) {
  const window = lastHours(history, hours)
  return [
    ...plotStatFields.map((field) => ({
      field,
      spec: sensorSpecs[field],
      stats: describe(window.map((record) => record.plots[plotId][field])),
    })),
    ...weatherStatFields.map((field) => ({
      field,
      spec: sensorSpecs[field],
      stats: describe(window.map((record) => record.weather[field])),
    })),
  ]
}
