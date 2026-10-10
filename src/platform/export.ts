// Exportação dos dados organizados para uso externo (planilhas, BI, relatórios).

import { plots } from '../domain/farm'
import type { PlatformEvent, TickRecord } from '../domain/types'

export function historyToCsv(history: TickRecord[]) {
  const plotColumns = plots.flatMap((plot) => [
    `${plot.id}_umidade_solo_pct`,
    `${plot.id}_temp_solo_c`,
    `${plot.id}_ph`,
    `${plot.id}_irrigacao_mm`,
    `${plot.id}_valvula_aberta`,
    `${plot.id}_leituras_corrigidas`,
  ])
  const header = [
    'timestamp',
    'temp_ar_c',
    'umidade_ar_pct',
    'radiacao_w_m2',
    'chuva_mm',
    'vento_km_h',
    ...plotColumns,
  ]

  const rows = history.map((record) => [
    new Date(record.timestamp).toISOString(),
    record.weather.airTemperature,
    record.weather.airHumidity,
    record.weather.solarRadiation,
    record.weather.rainfall,
    record.weather.windSpeed,
    ...plots.flatMap((plot) => {
      const snapshot = record.plots[plot.id]
      return [
        snapshot.soilMoisture,
        snapshot.soilTemperature,
        snapshot.soilPH,
        snapshot.irrigationVolume,
        snapshot.valveOpen ? 1 : 0,
        snapshot.correctedReadings,
      ]
    }),
  ])

  return [header, ...rows].map((row) => row.join(',')).join('\n')
}

export const eventsToJson = (events: PlatformEvent[]) =>
  JSON.stringify(
    events.map((event) => ({ ...event, timestamp: new Date(event.timestamp).toISOString() })),
    null,
    2,
  )

export function downloadFile(filename: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
