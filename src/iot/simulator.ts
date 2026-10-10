// Camada 1 - Coleta de dados do ambiente.
// Simula a rede IoT da fazenda: uma estação meteorológica e, em cada talhão,
// sensores de umidade, temperatura e pH do solo e um hidrômetro na linha de
// irrigação. O "mundo real" (clima e balanço hídrico do solo) evolui por um
// modelo físico simplificado; os sensores leem esse mundo com ruído e falhas.

import { referenceEvapotranspiration } from '../domain/agronomy'
import {
  TICKS_PER_HOUR,
  cropOf,
  deviceId,
  plotSensorKinds,
  plots,
  sensorSpecs,
  weatherSensorKinds,
} from '../domain/farm'
import type {
  RawReading,
  ScenarioKind,
  SensorKind,
  ValveState,
  WeatherSnapshot,
} from '../domain/types'
import { WEATHER_STATION_ID } from '../domain/types'
import { createRng, type Rng } from '../lib/random'
import { hourOfDay } from '../lib/time'

export type WeatherState = 'clear' | 'cloudy' | 'rain'

interface SoilState {
  moisture: number
  temperature: number
  ph: number
}

interface DeviceFault {
  kind: 'offline' | 'spike'
  ticksLeft: number
}

export interface SimulatorState {
  rngState: number
  weather: WeatherState
  airTemperature: number
  heatOffset: number
  /** Ciclos restantes de cada cenário ambiental injetado */
  scenarios: Record<Exclude<ScenarioKind, 'sensorFault'>, number>
  soil: Record<string, SoilState>
  faults: Record<string, DeviceFault>
}

/** Condição inicial do solo e pH de equilíbrio de cada talhão */
const soilBaseline: Record<string, { moisture: number; ph: number }> = {
  T1: { moisture: 33, ph: 6.1 },
  T2: { moisture: 30, ph: 5.25 },
  T3: { moisture: 30, ph: 5.9 },
  T4: { moisture: 38, ph: 6.4 },
}

/** Lâmina (mm) que eleva 1 ponto percentual de umidade na camada monitorada */
const MM_PER_PERCENT = 0.6
const FIELD_CAPACITY = 36
const WILTING_POINT = 12

/** Ruído de medição (desvio padrão) por tipo de sensor */
const sensorNoise: Record<SensorKind, number> = {
  soilMoisture: 0.25,
  soilTemperature: 0.1,
  soilPH: 0.02,
  irrigationVolume: 0,
  airTemperature: 0.15,
  airHumidity: 1,
  solarRadiation: 8,
  rainfall: 0,
  windSpeed: 1,
}

/** Acumuladores não sofrem falhas aleatórias (não há como imputar chuva) */
const faultFreeSensors: SensorKind[] = ['rainfall', 'irrigationVolume']
const RANDOM_MISSING_P = 0.0015
const RANDOM_SPIKE_P = 0.0012

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const diurnalTemperature = (hour: number) => 6 * Math.sin((2 * Math.PI * (hour - 9)) / 24)

export function createSimulatorState(seed: number, timestamp: number): SimulatorState {
  return {
    rngState: seed,
    weather: 'clear',
    airTemperature: 23 + diurnalTemperature(hourOfDay(timestamp)),
    heatOffset: 0,
    scenarios: { heavyRain: 0, heatwave: 0, highHumidity: 0 },
    soil: Object.fromEntries(
      plots.map((plot) => [
        plot.id,
        {
          moisture: soilBaseline[plot.id].moisture,
          temperature: 24,
          ph: soilBaseline[plot.id].ph,
        },
      ]),
    ),
    faults: {},
  }
}

function nextWeather(current: WeatherState, rng: Rng, forcedRain: boolean): WeatherState {
  if (forcedRain) return 'rain'
  const roll = rng.next()
  // Estação seca com irrigação: frentes de nuvens a cada ~1 dia e chuva rara
  if (current === 'clear') return roll < 0.006 ? 'cloudy' : 'clear'
  if (current === 'cloudy') {
    if (roll < 0.015) return 'rain'
    if (roll < 0.065) return 'clear'
    return 'cloudy'
  }
  return roll < 0.15 ? 'cloudy' : 'rain'
}

function simulateWeather(state: SimulatorState, hour: number, rng: Rng) {
  const weather = nextWeather(state.weather, rng, state.scenarios.heavyRain > 0)
  const heatTarget = state.scenarios.heatwave > 0 ? 7 : 0
  const heatOffset = state.heatOffset + clamp(heatTarget - state.heatOffset, -0.4, 0.4)
  const cloudCooling = weather === 'rain' ? -4 : weather === 'cloudy' ? -2 : 0
  const cloudFactor = weather === 'rain' ? 0.15 : weather === 'cloudy' ? 0.45 : 1

  const airTarget = 23 + diurnalTemperature(hour) + heatOffset + cloudCooling
  const airTemperature =
    state.airTemperature + (airTarget - state.airTemperature) * 0.35 + rng.normal(0, 0.15)

  const humidityBoost =
    (weather === 'rain' ? 30 : weather === 'cloudy' ? 10 : 0) +
    (state.scenarios.highHumidity > 0 ? 24 : 0)
  const airHumidity = clamp(
    62 - (airTemperature - 23) * 2.8 + humidityBoost + rng.normal(0, 1.5),
    18,
    100,
  )

  const daylight = hour > 6 && hour < 18 ? Math.sin((Math.PI * (hour - 6)) / 12) : 0
  const solarRadiation = Math.max(0, daylight * 950 * cloudFactor + (daylight > 0 ? rng.normal(0, 15) : 0))

  const rainfall =
    weather === 'rain'
      ? state.scenarios.heavyRain > 0
        ? rng.range(1.5, 3.5)
        : rng.range(0.2, 1.8)
      : 0
  const windSpeed = 6 + rng.range(0, 5) + (weather === 'rain' ? 8 : 0)

  const snapshot: WeatherSnapshot = {
    airTemperature,
    airHumidity,
    solarRadiation,
    rainfall,
    windSpeed,
  }

  return { weather, heatOffset, snapshot }
}

function simulateSoil(
  soil: SoilState,
  plotId: string,
  weather: WeatherSnapshot,
  irrigationMm: number,
  rng: Rng,
): SoilState {
  const crop = cropOf(plotId)
  const waterStress = clamp((soil.moisture - WILTING_POINT) / (20 - WILTING_POINT), 0, 1)
  const cropEt =
    referenceEvapotranspiration(weather.airTemperature, weather.solarRadiation) *
    crop.kc *
    waterStress

  let moisture =
    soil.moisture + (weather.rainfall * 0.85 + irrigationMm * 0.95 - cropEt) / MM_PER_PERCENT
  if (moisture > FIELD_CAPACITY) {
    moisture -= (moisture - FIELD_CAPACITY) * 0.2
  }
  moisture = clamp(moisture + rng.normal(0, 0.03), 8, 55)

  const soilTarget = 0.55 * weather.airTemperature + 0.45 * 24 - (moisture - 30) * 0.06
  const temperature = soil.temperature + (soilTarget - soil.temperature) * 0.12 + rng.normal(0, 0.05)
  const ph = soil.ph + (soilBaseline[plotId].ph - soil.ph) * 0.02 + rng.normal(0, 0.006)

  return { moisture, temperature, ph }
}

function readSensor(
  id: string,
  sourceId: string,
  sensor: SensorKind,
  trueValue: number,
  timestamp: number,
  faults: Record<string, DeviceFault>,
  rng: Rng,
): RawReading {
  const spec = sensorSpecs[sensor]
  const factor = 10 ** spec.decimals
  // O transdutor satura nos limites físicos (ex.: 0 W/m² à noite, 100% de UR)
  const measured = clamp(trueValue + rng.normal(0, sensorNoise[sensor]), spec.validRange.min, spec.validRange.max)
  let value: number | null = Math.round(measured * factor) / factor

  const activeFault = faults[id]
  if (activeFault) {
    value = activeFault.kind === 'offline' ? null : spikeValue(value, sensor, rng)
    activeFault.ticksLeft -= 1
    if (activeFault.ticksLeft <= 0) delete faults[id]
  } else if (!faultFreeSensors.includes(sensor)) {
    if (rng.chance(RANDOM_MISSING_P)) value = null
    else if (rng.chance(RANDOM_SPIKE_P)) value = spikeValue(value, sensor, rng)
  }

  return { deviceId: id, sourceId, sensor, timestamp, value }
}

function spikeValue(value: number, sensor: SensorKind, rng: Rng) {
  const spec = sensorSpecs[sensor]
  const span = spec.validRange.max - spec.validRange.min
  const jump = rng.chance(0.5) ? span * rng.range(0.4, 1.4) : -span * rng.range(0.3, 0.9)
  return Math.round((value + jump) * 10) / 10
}

export interface SimulatorStep {
  state: SimulatorState
  readings: RawReading[]
  /** Estado verdadeiro do ambiente, usado apenas para depuração e testes */
  truth: { weather: WeatherSnapshot; soil: Record<string, SoilState>; irrigation: Record<string, number> }
}

export function stepSimulator(
  state: SimulatorState,
  timestamp: number,
  valves: Record<string, ValveState>,
): SimulatorStep {
  const rng = createRng(state.rngState)
  const hour = hourOfDay(timestamp)
  const faults = Object.fromEntries(
    Object.entries(state.faults).map(([id, fault]) => [id, { ...fault }]),
  )

  const { weather, heatOffset, snapshot } = simulateWeather(state, hour, rng)
  const soil: Record<string, SoilState> = {}
  const irrigation: Record<string, number> = {}
  const readings: RawReading[] = []

  for (const sensor of weatherSensorKinds) {
    readings.push(
      readSensor(
        deviceId(WEATHER_STATION_ID, sensor),
        WEATHER_STATION_ID,
        sensor,
        snapshot[sensor],
        timestamp,
        faults,
        rng,
      ),
    )
  }

  for (const plot of plots) {
    const irrigationMm = valves[plot.id]?.open ? plot.irrigationRateMmH / TICKS_PER_HOUR : 0
    const nextSoil = simulateSoil(state.soil[plot.id], plot.id, snapshot, irrigationMm, rng)
    soil[plot.id] = nextSoil
    irrigation[plot.id] = irrigationMm

    const trueValues: Record<(typeof plotSensorKinds)[number], number> = {
      soilMoisture: nextSoil.moisture,
      soilTemperature: nextSoil.temperature,
      soilPH: nextSoil.ph,
      irrigationVolume: irrigationMm,
    }

    for (const sensor of plotSensorKinds) {
      readings.push(
        readSensor(deviceId(plot.id, sensor), plot.id, sensor, trueValues[sensor], timestamp, faults, rng),
      )
    }
  }

  const scenarios = Object.fromEntries(
    Object.entries(state.scenarios).map(([kind, ticks]) => [kind, Math.max(0, ticks - 1)]),
  ) as SimulatorState['scenarios']

  return {
    state: {
      rngState: rng.state,
      weather,
      airTemperature: snapshot.airTemperature,
      heatOffset,
      scenarios,
      soil,
      faults,
    },
    readings,
    truth: { weather: snapshot, soil, irrigation },
  }
}

const scenarioDurations: Record<Exclude<ScenarioKind, 'sensorFault'>, number> = {
  heavyRain: 2 * TICKS_PER_HOUR,
  heatwave: 6 * TICKS_PER_HOUR,
  highHumidity: 8 * TICKS_PER_HOUR,
}

export const scenarioDescriptions: Record<ScenarioKind, string> = {
  heavyRain: 'Chuva forte por 2 h',
  heatwave: 'Onda de calor (+7 °C) por 6 h',
  highHumidity: 'Umidade do ar elevada por 8 h',
  sensorFault: 'Falha de comunicação em sensor de umidade do solo',
}

/** Injeta um evento ambiental ou falha de hardware na simulação. */
export function applyScenario(
  state: SimulatorState,
  kind: ScenarioKind,
): { state: SimulatorState; detail: string } {
  if (kind === 'sensorFault') {
    const rng = createRng(state.rngState)
    const plot = rng.pick(plots)
    const id = deviceId(plot.id, 'soilMoisture')
    return {
      state: {
        ...state,
        rngState: rng.state,
        faults: { ...state.faults, [id]: { kind: 'offline', ticksLeft: TICKS_PER_HOUR } },
      },
      detail: `${id} (${plot.name}) sem resposta por ~1 h`,
    }
  }

  return {
    state: {
      ...state,
      weather: kind === 'heavyRain' ? 'rain' : state.weather,
      scenarios: { ...state.scenarios, [kind]: scenarioDurations[kind] },
    },
    detail: scenarioDescriptions[kind],
  }
}
