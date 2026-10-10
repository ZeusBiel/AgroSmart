// Camada 2 - Processamento e organização dos dados.
// Cada pacote IoT passa por: validação de presença -> faixa física e
// plausibilidade -> detecção de picos -> imputação (LOCF) -> suavização (média móvel
// exponencial) -> organização em um registro de série temporal por ciclo.

import { plotSensorKinds, plots, sensorSpecs, weatherSensorKinds } from '../domain/farm'
import type {
  PlatformEvent,
  PlotSnapshot,
  QualityFlag,
  RawReading,
  SensorKind,
  TickRecord,
  ValidatedReading,
  ValveState,
  WeatherSnapshot,
} from '../domain/types'
import { WEATHER_STATION_ID } from '../domain/types'
import { formatNumber } from '../lib/format'
import { hourOfDay } from '../lib/time'

export interface DeviceState {
  sensor: SensorKind
  sourceId: string
  lastValid: number | null
  smoothed: number | null
  consecutiveInvalid: number
  lastRaw: number | null
  lastFlag: QualityFlag
}

export type QualityCounters = Record<QualityFlag | 'total', number>

export interface PipelineState {
  devices: Record<string, DeviceState>
  counters: Record<SensorKind, QualityCounters>
}

export type PipelineEvent = Omit<PlatformEvent, 'id'>

export interface PipelineResult {
  state: PipelineState
  record: TickRecord
  validated: ValidatedReading[]
  events: PipelineEvent[]
}

/** Leituras inválidas seguidas que caracterizam falha do dispositivo */
export const DEVICE_FAILURE_THRESHOLD = 3

/** Plausibilidade física: não há radiação solar relevante à noite */
const NIGHT_RADIATION_LIMIT = 50
const isNight = (timestamp: number) => {
  const hour = hourOfDay(timestamp)
  return hour < 5.5 || hour > 18.5
}

const emptyCounters = (): QualityCounters => ({
  total: 0,
  ok: 0,
  missing: 0,
  out_of_range: 0,
  spike: 0,
})

export function createPipelineState(): PipelineState {
  const sensors = [...plotSensorKinds, ...weatherSensorKinds]
  return {
    devices: {},
    counters: Object.fromEntries(sensors.map((sensor) => [sensor, emptyCounters()])) as Record<
      SensorKind,
      QualityCounters
    >,
  }
}

export const flagLabels: Record<QualityFlag, string> = {
  ok: 'Válida',
  missing: 'Ausente',
  out_of_range: 'Fora da faixa',
  spike: 'Pico',
}

/** Classifica a leitura. A tolerância a saltos cresce após falhas seguidas
 * para que o sensor consiga se ressincronizar depois de um período offline. */
export function validateReading(
  reading: RawReading,
  device: Pick<DeviceState, 'lastValid' | 'consecutiveInvalid'> | undefined,
): QualityFlag {
  const spec = sensorSpecs[reading.sensor]
  const { value } = reading

  if (value === null || Number.isNaN(value)) return 'missing'
  if (value < spec.validRange.min || value > spec.validRange.max) return 'out_of_range'
  if (reading.sensor === 'solarRadiation' && value > NIGHT_RADIATION_LIMIT && isNight(reading.timestamp)) {
    return 'out_of_range'
  }

  if (spec.maxDelta !== null && device?.lastValid != null) {
    const allowed = spec.maxDelta * (device.consecutiveInvalid + 1)
    if (Math.abs(value - device.lastValid) > allowed) return 'spike'
  }

  return 'ok'
}

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

const neutralValue = (sensor: SensorKind) => {
  const { min, max } = sensorSpecs[sensor].validRange
  return sensor === 'rainfall' || sensor === 'irrigationVolume' ? 0 : (min + max) / 2
}

export function processReadings(
  state: PipelineState,
  readings: RawReading[],
  timestamp: number,
  valves: Record<string, ValveState>,
): PipelineResult {
  const devices = { ...state.devices }
  const counters = { ...state.counters }
  const events: PipelineEvent[] = []
  const validated: ValidatedReading[] = []

  for (const reading of readings) {
    const spec = sensorSpecs[reading.sensor]
    const previous = devices[reading.deviceId]
    const flag = validateReading(reading, previous)
    const sensorCounters = { ...counters[reading.sensor] }
    sensorCounters.total += 1
    sensorCounters[flag] += 1
    counters[reading.sensor] = sensorCounters

    let smoothed = previous?.smoothed ?? null
    let lastValid = previous?.lastValid ?? null
    let processed: number

    if (flag === 'ok' && reading.value !== null) {
      smoothed =
        smoothed === null || spec.smoothing >= 1
          ? reading.value
          : spec.smoothing * reading.value + (1 - spec.smoothing) * smoothed
      lastValid = reading.value
      processed = smoothed
    } else {
      // Imputação: repete o último valor confiável (LOCF)
      processed = smoothed ?? lastValid ?? neutralValue(reading.sensor)
    }
    processed = round(processed, spec.decimals)

    const consecutiveInvalid = flag === 'ok' ? 0 : (previous?.consecutiveInvalid ?? 0) + 1
    devices[reading.deviceId] = {
      sensor: reading.sensor,
      sourceId: reading.sourceId,
      lastValid,
      smoothed,
      consecutiveInvalid,
      lastRaw: reading.value,
      lastFlag: flag,
    }

    const plotId = reading.sourceId === WEATHER_STATION_ID ? undefined : reading.sourceId
    if (consecutiveInvalid === DEVICE_FAILURE_THRESHOLD) {
      events.push({
        timestamp,
        severity: 'warning',
        source: 'pipeline',
        plotId,
        message: `Sensor ${reading.deviceId} sem leituras válidas há 30 min`,
        detail: `${spec.label}: valores imputados com o último dado confiável (${formatNumber(processed, spec.decimals)} ${spec.unit}).`,
      })
    } else if (flag === 'ok' && (previous?.consecutiveInvalid ?? 0) >= DEVICE_FAILURE_THRESHOLD) {
      events.push({
        timestamp,
        severity: 'success',
        source: 'pipeline',
        plotId,
        message: `Sensor ${reading.deviceId} restabelecido`,
        detail: `Leituras válidas retomadas após ${previous?.consecutiveInvalid} ciclos com falha.`,
      })
    } else if ((flag === 'spike' || flag === 'out_of_range') && consecutiveInvalid === 1) {
      events.push({
        timestamp,
        severity: 'info',
        source: 'pipeline',
        plotId,
        message: `Leitura descartada em ${reading.deviceId}`,
        detail: `${flagLabels[flag]}: ${formatNumber(reading.value ?? 0, spec.decimals)} ${spec.unit} substituído por ${formatNumber(processed, spec.decimals)} ${spec.unit}.`,
      })
    }

    validated.push({ ...reading, flag, processed })
  }

  return {
    state: { devices, counters },
    record: organizeRecord(validated, timestamp, valves),
    validated,
    events,
  }
}

/** Organiza as leituras validadas em um registro estruturado por talhão. */
function organizeRecord(
  validated: ValidatedReading[],
  timestamp: number,
  valves: Record<string, ValveState>,
): TickRecord {
  const weather = {} as WeatherSnapshot
  const plotSnapshots: Record<string, PlotSnapshot> = {}

  for (const plot of plots) {
    plotSnapshots[plot.id] = {
      soilMoisture: 0,
      soilTemperature: 0,
      soilPH: 0,
      irrigationVolume: 0,
      valveOpen: valves[plot.id]?.open ?? false,
      correctedReadings: 0,
    }
  }

  for (const reading of validated) {
    if (reading.sourceId === WEATHER_STATION_ID) {
      weather[reading.sensor as keyof WeatherSnapshot] = reading.processed
      continue
    }
    const snapshot = plotSnapshots[reading.sourceId]
    if (!snapshot) continue
    const key = reading.sensor as (typeof plotSensorKinds)[number]
    snapshot[key] = reading.processed
    if (reading.flag !== 'ok') snapshot.correctedReadings += 1
  }

  return { timestamp, weather, plots: plotSnapshots }
}
