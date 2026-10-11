// Modelo de domínio da plataforma AgroSmart.
// As camadas (IoT -> pipeline -> análise -> automação -> visualização)
// conversam apenas por estes tipos.

export type CropId = 'soja' | 'milho' | 'cafe' | 'tomate'

export type Range = { min: number; max: number }

export interface CropProfile {
  id: CropId
  name: string
  /** Coeficiente de cultura (FAO-56) usado para converter ET0 em ETc. */
  kc: number
  /** Umidade volumétrica do solo (%) */
  moisture: { min: number; target: number; max: number }
  ph: Range
  /** Faixa de temperatura do ar considerada confortável para a cultura (°C) */
  airTemperature: Range
  /** Doença fúngica de referência para o alerta de risco */
  fungalDisease: string
}

export interface Plot {
  id: string
  name: string
  cropId: CropId
  areaHa: number
  /** Cor de identidade do talhão nos gráficos */
  color: string
  irrigationSystem: string
  /** Lâmina aplicada pelo sistema de irrigação (mm/h) */
  irrigationRateMmH: number
  /** Posição no mapa esquemático (viewBox 600x320) */
  mapPath: string
  mapLabel: { x: number; y: number }
}

export type PlotSensorKind =
  | 'soilMoisture'
  | 'soilTemperature'
  | 'soilPH'
  | 'irrigationVolume'

export type WeatherSensorKind =
  | 'airTemperature'
  | 'airHumidity'
  | 'solarRadiation'
  | 'rainfall'
  | 'windSpeed'

export type SensorKind = PlotSensorKind | WeatherSensorKind

export const WEATHER_STATION_ID = 'estacao'

/** Pacote enviado por um dispositivo IoT a cada ciclo de coleta. */
export interface RawReading {
  deviceId: string
  /** Talhão do sensor ou `estacao` para a estação meteorológica */
  sourceId: string
  sensor: SensorKind
  timestamp: number
  /** `null` quando o dispositivo não respondeu */
  value: number | null
}

export type QualityFlag = 'ok' | 'missing' | 'out_of_range' | 'spike'

export interface ValidatedReading extends RawReading {
  flag: QualityFlag
  /** Valor final após limpeza, imputação e suavização */
  processed: number
}

export interface WeatherSnapshot {
  airTemperature: number
  airHumidity: number
  solarRadiation: number
  rainfall: number
  windSpeed: number
}

export interface PlotSnapshot {
  soilMoisture: number
  soilTemperature: number
  soilPH: number
  irrigationVolume: number
  valveOpen: boolean
  /** Quantidade de leituras do talhão que precisaram de correção no ciclo */
  correctedReadings: number
}

/** Registro organizado de um ciclo de coleta (série temporal). */
export interface TickRecord {
  timestamp: number
  weather: WeatherSnapshot
  plots: Record<string, PlotSnapshot>
}

export type Severity = 'info' | 'success' | 'warning' | 'critical'

export type EventSource = 'automacao' | 'pipeline' | 'operador' | 'simulacao'

export interface PlatformEvent {
  id: string
  timestamp: number
  severity: Severity
  source: EventSource
  message: string
  detail?: string
  plotId?: string
  ruleId?: string
}

export type ValveMode = 'auto' | 'manual'

export interface ValveState {
  open: boolean
  mode: ValveMode
  openedAt: number | null
  /** Umidade em que a irrigação em curso deve parar (definida pela automação) */
  targetMoisture: number | null
}

export type ScenarioKind = 'heavyRain' | 'heatwave' | 'highHumidity' | 'sensorFault'
