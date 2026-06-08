export type RoverState = 'extracting' | 'idle' | 'maintenance'

export type AlertLevel = 'normal' | 'warning' | 'critical'

export type MissionEventType = 'info' | 'warning' | 'success' | 'critical'

export type IceQuality = 'low' | 'medium' | 'high'

export type ExtractionStatus = 'completed' | 'partial' | 'failed'

export interface User {
  id: string
  email: string
  passwordHash: string
  lastLogin: string
}

export interface TeamMember {
  name: string
  rm: string
}

export interface RoverStatus {
  id: string
  state: RoverState
  location: string
  temperature: number
  iceDetected: boolean
  batteryLevel: number
  collectedVolume: number
  alertLevel: AlertLevel
  nextCollectionMinutes: number
}

export interface SensorData {
  timestamp: string
  groundTemperature: number
  humidity: number
  iceConcentration: number
  pressure: number
}

export interface MissionEvent {
  id: string
  timestamp: string
  description: string
  type: MissionEventType
}

export interface ExtractionReport {
  id: string
  dateTime: string
  volume: number
  iceQuality: IceQuality
  status: ExtractionStatus
  note: string
}
