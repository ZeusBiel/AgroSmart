import type { CropId, CropProfile, Plot, Range, SensorKind } from './types'

export const farm = {
  name: 'Fazenda Santa Clara',
  location: 'Rio Verde - GO',
  operator: 'operador@agrosmart.app',
}

export const crops: Record<CropId, CropProfile> = {
  soja: {
    id: 'soja',
    name: 'Soja',
    kc: 1.05,
    moisture: { min: 24, target: 31, max: 38 },
    ph: { min: 5.5, max: 6.5 },
    airTemperature: { min: 20, max: 32 },
    fungalDisease: 'ferrugem-asiática',
  },
  milho: {
    id: 'milho',
    name: 'Milho',
    kc: 1.15,
    moisture: { min: 22, target: 29, max: 37 },
    ph: { min: 5.5, max: 6.8 },
    airTemperature: { min: 18, max: 33 },
    fungalDisease: 'cercosporiose',
  },
  cafe: {
    id: 'cafe',
    name: 'Café',
    kc: 0.95,
    moisture: { min: 26, target: 32, max: 40 },
    ph: { min: 5.5, max: 6.5 },
    airTemperature: { min: 18, max: 30 },
    fungalDisease: 'ferrugem-do-cafeeiro',
  },
  tomate: {
    id: 'tomate',
    name: 'Tomate',
    kc: 1.15,
    moisture: { min: 28, target: 35, max: 42 },
    ph: { min: 6.0, max: 6.8 },
    airTemperature: { min: 16, max: 30 },
    fungalDisease: 'requeima',
  },
}

// Cores categóricas validadas (dataviz) contra a superfície escura #141718:
// ordem fixa por talhão, nunca reatribuída por filtro.
export const plots: Plot[] = [
  {
    id: 'T1',
    name: 'Talhão 1',
    cropId: 'soja',
    areaHa: 42,
    color: '#3987e5',
    irrigationSystem: 'Pivô central',
    irrigationRateMmH: 7,
    mapPath: 'M20,22 L268,14 L282,170 L28,182 Z',
    mapLabel: { x: 150, y: 96 },
  },
  {
    id: 'T2',
    name: 'Talhão 2',
    cropId: 'milho',
    areaHa: 35,
    color: '#d95926',
    irrigationSystem: 'Pivô central',
    irrigationRateMmH: 7,
    mapPath: 'M298,14 L580,28 L572,160 L306,168 Z',
    mapLabel: { x: 440, y: 90 },
  },
  {
    id: 'T3',
    name: 'Talhão 3',
    cropId: 'cafe',
    areaHa: 18,
    color: '#199e70',
    irrigationSystem: 'Gotejamento',
    irrigationRateMmH: 4,
    mapPath: 'M30,200 L232,192 L238,304 L24,306 Z',
    mapLabel: { x: 130, y: 250 },
  },
  {
    id: 'T4',
    name: 'Talhão 4',
    cropId: 'tomate',
    areaHa: 6,
    color: '#c98500',
    irrigationSystem: 'Gotejamento',
    irrigationRateMmH: 5,
    mapPath: 'M254,192 L382,186 L386,302 L260,306 Z',
    mapLabel: { x: 320, y: 246 },
  },
]

export const plotById = Object.fromEntries(plots.map((plot) => [plot.id, plot])) as Record<
  string,
  Plot
>

export const cropOf = (plotId: string): CropProfile => crops[plotById[plotId].cropId]

export interface SensorSpec {
  label: string
  unit: string
  /** Limite físico do sensor: fora disso a leitura é descartada */
  validRange: Range
  /** Variação máxima plausível entre dois ciclos (detecção de picos) */
  maxDelta: number | null
  /** Fator da média móvel exponencial (1 = sem suavização) */
  smoothing: number
  decimals: number
  devicePrefix: string
}

export const sensorSpecs: Record<SensorKind, SensorSpec> = {
  soilMoisture: {
    label: 'Umidade do solo',
    unit: '%',
    validRange: { min: 0, max: 60 },
    maxDelta: 8,
    smoothing: 0.6,
    decimals: 1,
    devicePrefix: 'UMI',
  },
  soilTemperature: {
    label: 'Temperatura do solo',
    unit: '°C',
    validRange: { min: -5, max: 55 },
    maxDelta: 3,
    smoothing: 0.6,
    decimals: 1,
    devicePrefix: 'TSO',
  },
  soilPH: {
    label: 'pH do solo',
    unit: 'pH',
    validRange: { min: 3, max: 10 },
    maxDelta: 0.35,
    smoothing: 0.4,
    decimals: 2,
    devicePrefix: 'PH',
  },
  irrigationVolume: {
    label: 'Hidrômetro (lâmina)',
    unit: 'mm',
    validRange: { min: 0, max: 5 },
    maxDelta: null,
    smoothing: 1,
    decimals: 2,
    devicePrefix: 'HID',
  },
  airTemperature: {
    label: 'Temperatura do ar',
    unit: '°C',
    validRange: { min: -10, max: 50 },
    maxDelta: 4,
    smoothing: 0.7,
    decimals: 1,
    devicePrefix: 'TAR',
  },
  airHumidity: {
    label: 'Umidade do ar',
    unit: '%',
    validRange: { min: 0, max: 100 },
    maxDelta: 35,
    smoothing: 0.7,
    decimals: 0,
    devicePrefix: 'URA',
  },
  solarRadiation: {
    label: 'Radiação solar',
    unit: 'W/m²',
    validRange: { min: 0, max: 1400 },
    // Nuvens mudam a radiação bruscamente; usa-se a checagem de plausibilidade noturna
    maxDelta: null,
    smoothing: 0.8,
    decimals: 0,
    devicePrefix: 'RAD',
  },
  rainfall: {
    label: 'Pluviômetro',
    unit: 'mm',
    validRange: { min: 0, max: 30 },
    maxDelta: null,
    smoothing: 1,
    decimals: 1,
    devicePrefix: 'PLU',
  },
  windSpeed: {
    label: 'Vento',
    unit: 'km/h',
    validRange: { min: 0, max: 150 },
    maxDelta: 25,
    smoothing: 0.7,
    decimals: 0,
    devicePrefix: 'VEN',
  },
}

export const plotSensorKinds = [
  'soilMoisture',
  'soilTemperature',
  'soilPH',
  'irrigationVolume',
] as const

export const weatherSensorKinds = [
  'airTemperature',
  'airHumidity',
  'solarRadiation',
  'rainfall',
  'windSpeed',
] as const

export const deviceId = (sourceId: string, sensor: SensorKind) =>
  `${sourceId === 'estacao' ? 'EST' : sourceId}-${sensorSpecs[sensor].devicePrefix}-01`

/** Cada ciclo de coleta representa 10 minutos de operação. */
export const TICK_MINUTES = 10
export const TICK_MS = TICK_MINUTES * 60 * 1000
export const TICKS_PER_HOUR = 60 / TICK_MINUTES
/** Retenção da série temporal em memória: 72 h */
export const HISTORY_TICKS = 72 * TICKS_PER_HOUR
/** Histórico gerado ao abrir a plataforma: 48 h */
export const BACKFILL_TICKS = 48 * TICKS_PER_HOUR

/** Irrigação de referência por calendário fixo (sem sensores), usada para medir economia */
export const CALENDAR_IRRIGATION_MM_DAY = 8

export const teamMembers = [
  { name: 'Israel Igarashi', rm: '98359' },
  { name: 'Leonardo Bernardes', rm: '99788' },
  { name: 'Matheus Medeiros', rm: '97774' },
  { name: 'Ryan Aquino', rm: '550422' },
  { name: 'Gabriel Oliveira', rm: '98565' },
]
