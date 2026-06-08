import type { FormEvent } from 'react'
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertTriangle,
  AreaChart,
  BatteryMedium,
  ClipboardList,
  Droplets,
  Gauge,
  History,
  LockKeyhole,
  MapPinned,
  Pause,
  Play,
  Power,
  Radar,
  RefreshCw,
  Satellite,
  ShieldCheck,
  Snowflake,
  Thermometer,
  Timer,
  Users,
} from 'lucide-react'
import './App.css'
import {
  extractionReports,
  initialMissionEvents,
  initialRoverStatus,
  operatorUser,
  sensorData,
  teamMembers,
} from './data/mockData'
import type {
  ExtractionReport,
  MissionEvent,
  MissionEventType,
  RoverState,
  RoverStatus,
} from './types'

type Screen = 'dashboard' | 'rover' | 'history'

type MetricCardProps = {
  icon: LucideIcon
  label: string
  value: string
  meta: string
  tone?: 'neutral' | 'success' | 'warning' | 'critical'
}

const missionTarget = 180

const stateLabel: Record<RoverState, string> = {
  extracting: 'Extraindo',
  idle: 'Em espera',
  maintenance: 'Manutenção',
}

const eventLabel: Record<MissionEventType, string> = {
  info: 'Info',
  warning: 'Alerta',
  success: 'Sucesso',
  critical: 'Crítico',
}

const iceQualityLabel: Record<ExtractionReport['iceQuality'], string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
}

const reportStatusLabel: Record<ExtractionReport['status'], string> = {
  completed: 'Concluída',
  partial: 'Parcial',
  failed: 'Falhou',
}

const navigationItems: Array<{
  id: Screen
  label: string
  icon: LucideIcon
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'rover', label: 'Rover', icon: Satellite },
  { id: 'history', label: 'Relatórios', icon: History },
]

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

const makeEvent = (
  description: string,
  type: MissionEventType = 'info',
): MissionEvent => ({
  id:
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `evt-${Date.now()}`,
  timestamp: new Date().toISOString(),
  description,
  type,
})

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [rover, setRover] = useState<RoverStatus>(initialRoverStatus)
  const [events, setEvents] = useState<MissionEvent[]>(initialMissionEvents)

  const latestSensor = sensorData[0]
  const collectionProgress = Math.min(
    100,
    Math.round((rover.collectedVolume / missionTarget) * 100),
  )

  const reportsSummary = useMemo(() => {
    const total = extractionReports.reduce((sum, report) => sum + report.volume, 0)
    const average = total / extractionReports.length
    const completed = extractionReports.filter(
      (report) => report.status === 'completed',
    ).length

    return {
      total: total.toFixed(1),
      average: average.toFixed(1),
      efficiency: Math.round((completed / extractionReports.length) * 100),
    }
  }, [])

  function appendEvent(description: string, type: MissionEventType = 'info') {
    setEvents((currentEvents) => [
      makeEvent(description, type),
      ...currentEvents,
    ].slice(0, 10))
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

    if (!isEmailValid) {
      setLoginError('Informe um e-mail válido.')
      return
    }

    if (password.length < 6) {
      setLoginError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setLoginError('')
    setIsAuthenticated(true)
  }

  function handleStartExtraction() {
    const willWarnBattery = rover.batteryLevel <= 37

    setRover((currentRover) => {
      const nextBattery = Math.max(currentRover.batteryLevel - 7, 0)

      return {
        ...currentRover,
        state: 'extracting',
        iceDetected: true,
        batteryLevel: nextBattery,
        collectedVolume: Number((currentRover.collectedVolume + 4.8).toFixed(1)),
        temperature: Number((currentRover.temperature - 0.7).toFixed(1)),
        alertLevel: nextBattery < 30 ? 'warning' : 'normal',
        nextCollectionMinutes: 6,
      }
    })

    appendEvent(
      willWarnBattery
        ? 'Extração iniciada com bateria em observação'
        : 'Gelo detectado e extração iniciada',
      willWarnBattery ? 'warning' : 'success',
    )
  }

  function handlePauseMission() {
    setRover((currentRover) => ({
      ...currentRover,
      state: 'idle',
      nextCollectionMinutes: 18,
    }))

    appendEvent('Missão pausada pelo operador', 'info')
  }

  function handleRecalibrateSensors() {
    setRover((currentRover) => ({
      ...currentRover,
      state: 'maintenance',
      alertLevel: 'normal',
      temperature: Number((currentRover.temperature + 0.9).toFixed(1)),
      nextCollectionMinutes: 10,
    }))

    appendEvent('Sensores recalibrados com sucesso', 'success')

    window.setTimeout(() => {
      setRover((currentRover) =>
        currentRover.state === 'maintenance'
          ? { ...currentRover, state: 'idle' }
          : currentRover,
      )
    }, 900)
  }

  function handleLogout() {
    setIsAuthenticated(false)
    setEmail('')
    setPassword('')
    setActiveScreen('dashboard')
  }

  if (!isAuthenticated) {
    return (
      <main className="login-page">
        <section className="login-visual" aria-label="Imagem do Shackleton Crater">
          <img src="shackleton-crater.jpeg" alt="Mosaico do Shackleton Crater" />
          <div className="mission-mark">
            <Droplets aria-hidden="true" />
            <span>Lunar H2O Rover</span>
          </div>
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div>
            <p className="eyebrow">Console de missão</p>
            <h1 id="login-title">Acesso do operador</h1>
            <p className="lead">
              Monitoramento remoto de extração de gelo no polo sul lunar.
            </p>
          </div>

          <form className="login-form" onSubmit={handleLogin} noValidate>
            <label htmlFor="email">
              E-mail
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="operador@missao.com"
                autoComplete="email"
              />
            </label>

            <label htmlFor="password">
              Senha
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="mínimo 6 caracteres"
                autoComplete="current-password"
              />
            </label>

            {loginError && (
              <p className="form-error" role="alert">
                {loginError}
              </p>
            )}

            <button className="primary-button" type="submit">
              <LockKeyhole aria-hidden="true" />
              Entrar no painel
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Lunar H2O Rover</p>
          <h1>Missão Shackleton-B</h1>
          <p className="operator-line">Operador mockado: {operatorUser.email}</p>
        </div>
        <button className="icon-button" type="button" onClick={handleLogout}>
          <Power aria-hidden="true" />
          <span>Sair</span>
        </button>
      </header>

      {activeScreen === 'dashboard' && (
        <DashboardScreen
          collectionProgress={collectionProgress}
          events={events}
          latestSensor={latestSensor}
          reportsSummary={reportsSummary}
          rover={rover}
        />
      )}

      {activeScreen === 'rover' && (
        <RoverScreen
          events={events}
          latestSensor={latestSensor}
          onPauseMission={handlePauseMission}
          onRecalibrateSensors={handleRecalibrateSensors}
          onStartExtraction={handleStartExtraction}
          rover={rover}
        />
      )}

      {activeScreen === 'history' && (
        <HistoryScreen reportsSummary={reportsSummary} />
      )}

      <nav className="bottom-nav" aria-label="Navegação principal">
        {navigationItems.map((item) => {
          const Icon = item.icon

          return (
            <button
              aria-current={activeScreen === item.id ? 'page' : undefined}
              className={activeScreen === item.id ? 'nav-item active' : 'nav-item'}
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              type="button"
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>
    </main>
  )
}

function DashboardScreen({
  collectionProgress,
  events,
  latestSensor,
  reportsSummary,
  rover,
}: {
  collectionProgress: number
  events: MissionEvent[]
  latestSensor: (typeof sensorData)[number]
  reportsSummary: { total: string; average: string; efficiency: number }
  rover: RoverStatus
}) {
  return (
    <section className="screen-stack">
      <section className="mission-hero" aria-label="Resumo da missão">
        <img src="shackleton-crater.jpeg" alt="" />
        <div className="mission-hero-content">
          <StatusPill tone={getAlertTone(rover.alertLevel)} text={stateLabel[rover.state]} />
          <h2>Extração de água em crateras permanentemente sombreadas</h2>
          <p>
            O rover explora o setor B14, valida gelo por sensores IoT e prepara
            coletas para suporte de base lunar.
          </p>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Indicadores da missão">
        <MetricCard
          icon={Droplets}
          label="Água coletada"
          meta={`${collectionProgress}% da meta de ${missionTarget} L`}
          tone="success"
          value={`${rover.collectedVolume.toFixed(1)} L`}
        />
        <MetricCard
          icon={Thermometer}
          label="Temperatura média"
          meta="Cratera em sombra permanente"
          tone="warning"
          value={`${rover.temperature.toFixed(1)} °C`}
        />
        <MetricCard
          icon={Snowflake}
          label="Detecção de gelo"
          meta={`${latestSensor.iceConcentration}% de concentração`}
          tone={rover.iceDetected ? 'success' : 'warning'}
          value={rover.iceDetected ? 'Ativa' : 'Instável'}
        />
        <MetricCard
          icon={BatteryMedium}
          label="Bateria do rover"
          meta={rover.batteryLevel < 30 ? 'Recarga recomendada' : 'Energia nominal'}
          tone={rover.batteryLevel < 30 ? 'critical' : 'neutral'}
          value={`${rover.batteryLevel}%`}
        />
      </section>

      <section className="progress-section" aria-label="Progresso de coleta">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Coleta diária</p>
            <h2>Meta de gelo processado</h2>
          </div>
          <span>{collectionProgress}%</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div style={{ width: `${collectionProgress}%` }} />
        </div>
        <div className="split-row">
          <span>Próxima coleta em {rover.nextCollectionMinutes} min</span>
          <span>Eficiência {reportsSummary.efficiency}%</span>
        </div>
      </section>

      <EventTimeline events={events.slice(0, 4)} />
    </section>
  )
}

function RoverScreen({
  events,
  latestSensor,
  onPauseMission,
  onRecalibrateSensors,
  onStartExtraction,
  rover,
}: {
  events: MissionEvent[]
  latestSensor: (typeof sensorData)[number]
  onPauseMission: () => void
  onRecalibrateSensors: () => void
  onStartExtraction: () => void
  rover: RoverStatus
}) {
  const sensorRows = [
    {
      icon: Radar,
      name: 'Radar subsuperficial',
      value: 'Online',
      detail: '92% sinal',
      tone: 'success' as const,
    },
    {
      icon: Snowflake,
      name: 'Espectrômetro de gelo',
      value: `${latestSensor.iceConcentration}%`,
      detail: 'Amostra estável',
      tone: 'success' as const,
    },
    {
      icon: Thermometer,
      name: 'Sensor criogênico',
      value: `${latestSensor.groundTemperature.toFixed(1)} °C`,
      detail: rover.alertLevel === 'warning' ? 'Em observação' : 'Nominal',
      tone: rover.alertLevel === 'warning' ? ('warning' as const) : ('neutral' as const),
    },
    {
      icon: Gauge,
      name: 'Pressão interna',
      value: `${latestSensor.pressure.toFixed(2)} kPa`,
      detail: 'Compartimento selado',
      tone: 'neutral' as const,
    },
  ]

  return (
    <section className="screen-stack">
      <section className="status-panel" aria-label="Status operacional do rover">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{rover.id}</p>
            <h2>Status do rover</h2>
          </div>
          <StatusPill tone={getAlertTone(rover.alertLevel)} text={stateLabel[rover.state]} />
        </div>

        <div className="detail-grid">
          <DetailItem icon={MapPinned} label="Localização" value={rover.location} />
          <DetailItem
            icon={Droplets}
            label="Volume total"
            value={`${rover.collectedVolume.toFixed(1)} L`}
          />
          <DetailItem
            icon={BatteryMedium}
            label="Bateria"
            value={`${rover.batteryLevel}%`}
          />
          <DetailItem
            icon={Timer}
            label="Próximo ciclo"
            value={`${rover.nextCollectionMinutes} min`}
          />
        </div>
      </section>

      <section className="action-grid" aria-label="Ações do operador">
        <button className="action-button start" type="button" onClick={onStartExtraction}>
          <Play aria-hidden="true" />
          <span>Iniciar extração</span>
        </button>
        <button className="action-button pause" type="button" onClick={onPauseMission}>
          <Pause aria-hidden="true" />
          <span>Pausar missão</span>
        </button>
        <button
          className="action-button calibrate"
          type="button"
          onClick={onRecalibrateSensors}
        >
          <RefreshCw aria-hidden="true" />
          <span>Recalibrar sensores</span>
        </button>
      </section>

      <section className="sensor-list" aria-label="Sensores IoT">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sensores IoT</p>
            <h2>Telemetria ativa</h2>
          </div>
        </div>
        {sensorRows.map((sensor) => (
          <div className="sensor-row" key={sensor.name}>
            <sensor.icon aria-hidden="true" />
            <div>
              <strong>{sensor.name}</strong>
              <span>{sensor.detail}</span>
            </div>
            <StatusPill tone={sensor.tone} text={sensor.value} />
          </div>
        ))}
      </section>

      <EventTimeline events={events.slice(0, 5)} />
    </section>
  )
}

function HistoryScreen({
  reportsSummary,
}: {
  reportsSummary: { total: string; average: string; efficiency: number }
}) {
  return (
    <section className="screen-stack">
      <section className="metrics-grid compact" aria-label="Resumo dos relatórios">
        <MetricCard
          icon={ClipboardList}
          label="Total diário"
          meta="Registros mockados"
          tone="success"
          value={`${reportsSummary.total} L`}
        />
        <MetricCard
          icon={AreaChart}
          label="Média de coleta"
          meta="Por ciclo de extração"
          value={`${reportsSummary.average} L`}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Eficiência"
          meta="Ciclos concluídos"
          tone="success"
          value={`${reportsSummary.efficiency}%`}
        />
      </section>

      <section className="report-list" aria-label="Histórico de extrações">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2>Relatórios de extração</h2>
          </div>
        </div>

        {extractionReports.map((report) => (
          <article className="report-item" key={report.id}>
            <div className="report-topline">
              <div>
                <strong>{formatDateTime(report.dateTime)}</strong>
                <span>{report.note}</span>
              </div>
              <StatusPill
                tone={getReportTone(report.status)}
                text={reportStatusLabel[report.status]}
              />
            </div>
            <div className="report-metrics">
              <span>{report.volume.toFixed(1)} L</span>
              <span>Qualidade {iceQualityLabel[report.iceQuality]}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="team-list" aria-label="Integrantes do projeto">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Equipe</p>
            <h2>Integrantes do projeto</h2>
          </div>
          <Users aria-hidden="true" />
        </div>

        <div className="team-grid">
          {teamMembers.map((member) => (
            <article className="team-member" key={member.rm}>
              <strong>{member.name}</strong>
              <span>RM {member.rm}</span>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

function MetricCard({
  icon: Icon,
  label,
  meta,
  tone = 'neutral',
  value,
}: MetricCardProps) {
  return (
    <article className={`metric-card ${tone}`}>
      <Icon aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </article>
  )
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="detail-item">
      <Icon aria-hidden="true" />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function EventTimeline({ events }: { events: MissionEvent[] }) {
  return (
    <section className="event-timeline" aria-label="Eventos da missão">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Eventos</p>
          <h2>Registro operacional</h2>
        </div>
      </div>

      {events.map((event) => (
        <article className={`event-item ${event.type}`} key={event.id}>
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>{event.description}</strong>
            <span>
              {eventLabel[event.type]} - {formatDateTime(event.timestamp)}
            </span>
          </div>
        </article>
      ))}
    </section>
  )
}

function StatusPill({
  text,
  tone,
}: {
  text: string
  tone: 'neutral' | 'success' | 'warning' | 'critical'
}) {
  return <span className={`status-pill ${tone}`}>{text}</span>
}

function getReportTone(status: ExtractionReport['status']) {
  if (status === 'completed') {
    return 'success'
  }

  if (status === 'failed') {
    return 'critical'
  }

  return 'warning'
}

function getAlertTone(alertLevel: RoverStatus['alertLevel']) {
  return alertLevel === 'normal' ? 'neutral' : alertLevel
}

export default App
