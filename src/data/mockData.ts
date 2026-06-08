import type {
  ExtractionReport,
  MissionEvent,
  RoverStatus,
  SensorData,
  TeamMember,
  User,
} from '../types'

export const operatorUser: User = {
  id: 'usr-001',
  email: 'operator@lunarh2o.app',
  passwordHash: 'mock-local-auth-only',
  lastLogin: '2026-06-08T00:12:00-03:00',
}

export const teamMembers: TeamMember[] = [
  { name: 'Israel Igarashi', rm: '98359' },
  { name: 'Leonardo Bernardes', rm: '99788' },
  { name: 'Matheus Medeiros', rm: '97774' },
  { name: 'Ryan Aquino', rm: '550422' },
  { name: 'Gabriel Oliveira', rm: '98565' },
]

export const initialRoverStatus: RoverStatus = {
  id: 'lhr-07',
  state: 'idle',
  location: 'Shackleton - Setor B14',
  temperature: -173.8,
  iceDetected: true,
  batteryLevel: 68,
  collectedVolume: 124.7,
  alertLevel: 'warning',
  nextCollectionMinutes: 12,
}

export const sensorData: SensorData[] = [
  {
    timestamp: '2026-06-08T00:18:00-03:00',
    groundTemperature: -173.8,
    humidity: 4.8,
    iceConcentration: 61,
    pressure: 0.02,
  },
  {
    timestamp: '2026-06-08T00:04:00-03:00',
    groundTemperature: -171.4,
    humidity: 4.2,
    iceConcentration: 56,
    pressure: 0.02,
  },
  {
    timestamp: '2026-06-07T23:46:00-03:00',
    groundTemperature: -168.9,
    humidity: 3.9,
    iceConcentration: 49,
    pressure: 0.03,
  },
]

export const initialMissionEvents: MissionEvent[] = [
  {
    id: 'evt-004',
    timestamp: '2026-06-08T00:18:00-03:00',
    description: 'Gelo detectado em concentração moderada',
    type: 'success',
  },
  {
    id: 'evt-003',
    timestamp: '2026-06-08T00:11:00-03:00',
    description: 'Anomalia de temperatura estabilizada',
    type: 'warning',
  },
  {
    id: 'evt-002',
    timestamp: '2026-06-07T23:58:00-03:00',
    description: 'Pacote de sensores IoT sincronizado',
    type: 'info',
  },
  {
    id: 'evt-001',
    timestamp: '2026-06-07T23:41:00-03:00',
    description: 'Coleta parcial concluída no Setor B13',
    type: 'success',
  },
]

export const extractionReports: ExtractionReport[] = [
  {
    id: 'rep-005',
    dateTime: '2026-06-08T00:10:00-03:00',
    volume: 18.4,
    iceQuality: 'high',
    status: 'completed',
    note: 'Amostra com baixa impureza mineral',
  },
  {
    id: 'rep-004',
    dateTime: '2026-06-07T22:48:00-03:00',
    volume: 12.9,
    iceQuality: 'medium',
    status: 'partial',
    note: 'Coleta interrompida por oscilação térmica',
  },
  {
    id: 'rep-003',
    dateTime: '2026-06-07T21:16:00-03:00',
    volume: 21.6,
    iceQuality: 'high',
    status: 'completed',
    note: 'Extração estável em sombra permanente',
  },
  {
    id: 'rep-002',
    dateTime: '2026-06-07T19:35:00-03:00',
    volume: 9.7,
    iceQuality: 'low',
    status: 'failed',
    note: 'Gelo insuficiente para ciclo completo',
  },
  {
    id: 'rep-001',
    dateTime: '2026-06-07T18:04:00-03:00',
    volume: 17.3,
    iceQuality: 'medium',
    status: 'completed',
    note: 'Perfil de solo confirmado por radar',
  },
]
