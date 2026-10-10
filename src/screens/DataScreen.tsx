import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BrainCircuit,
  Database,
  Download,
  Filter,
  RadioTower,
  ShieldCheck,
  Waves,
} from 'lucide-react'
import { flagTone } from '../components/tones'
import { SectionHeading, StatusPill } from '../components/ui'
import { HISTORY_TICKS, TICK_MINUTES, plotById, sensorSpecs, teamMembers } from '../domain/farm'
import type { SensorKind } from '../domain/types'
import { formatDateTime, formatNumber } from '../lib/format'
import { flagLabels } from '../pipeline/processing'
import { downloadFile, eventsToJson, historyToCsv } from '../platform/export'
import type { PlatformState } from '../platform/platform'

interface Stage {
  icon: LucideIcon
  title: string
  value: string
  detail: string
}

export function DataScreen({ state }: { state: PlatformState }) {
  const counters = Object.entries(state.pipeline.counters) as Array<
    [SensorKind, PlatformState['pipeline']['counters'][SensorKind]]
  >
  const totals = counters.reduce(
    (acc, [, c]) => ({
      total: acc.total + c.total,
      ok: acc.ok + c.ok,
      corrected: acc.corrected + c.missing + c.out_of_range + c.spike,
    }),
    { total: 0, ok: 0, corrected: 0 },
  )
  const triggers = Object.values(state.automation.stats).reduce((sum, stats) => sum + stats.triggers, 0)
  const devices = state.lastReadings
  const samplePacket = devices.find((reading) => reading.sensor === 'soilMoisture') ?? devices[0]

  const stages: Stage[] = [
    {
      icon: RadioTower,
      title: 'Coleta IoT',
      value: formatNumber(totals.total, 0),
      detail: `leituras de ${devices.length} dispositivos a cada ${TICK_MINUTES} min`,
    },
    {
      icon: ShieldCheck,
      title: 'Validação',
      value: `${formatNumber((totals.ok / Math.max(1, totals.total)) * 100, 2)}%`,
      detail: 'válidas (presença, faixa física, picos)',
    },
    {
      icon: Filter,
      title: 'Limpeza',
      value: formatNumber(totals.corrected, 0),
      detail: 'leituras corrigidas por imputação (LOCF)',
    },
    {
      icon: Waves,
      title: 'Suavização',
      value: 'MME',
      detail: 'média móvel exponencial por sensor',
    },
    {
      icon: Database,
      title: 'Série temporal',
      value: formatNumber(state.history.length, 0),
      detail: `registros organizados (retenção ${(HISTORY_TICKS * TICK_MINUTES) / 60} h)`,
    },
    {
      icon: BrainCircuit,
      title: 'Análise e automação',
      value: formatNumber(triggers, 0),
      detail: `ações e alertas · ${state.insights.length} recomendações ativas`,
    },
  ]

  return (
    <section className="screen-stack">
      <section className="panel">
        <SectionHeading eyebrow="Integração" title="Fluxo de dados da plataforma" />
        <ol className="pipeline-flow">
          {stages.map((stage, index) => (
            <li key={stage.title}>
              <div className="pipeline-stage">
                <stage.icon aria-hidden="true" />
                <span>{stage.title}</span>
                <strong>{stage.value}</strong>
                <small>{stage.detail}</small>
              </div>
              {index < stages.length - 1 && <ArrowRight className="pipeline-arrow" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>

      <div className="chart-pair">
        <section className="panel">
          <SectionHeading eyebrow="Qualidade" title="Leituras por tipo de sensor" />
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Sensor</th>
                  <th scope="col">Total</th>
                  <th scope="col">Válidas</th>
                  <th scope="col">Ausentes</th>
                  <th scope="col">Fora da faixa</th>
                  <th scope="col">Picos</th>
                </tr>
              </thead>
              <tbody>
                {counters.map(([sensor, c]) => (
                  <tr key={sensor}>
                    <th scope="row">{sensorSpecs[sensor].label}</th>
                    <td>{formatNumber(c.total, 0)}</td>
                    <td>{formatNumber((c.ok / Math.max(1, c.total)) * 100, 1)}%</td>
                    <td>{c.missing}</td>
                    <td>{c.out_of_range}</td>
                    <td>{c.spike}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <SectionHeading eyebrow="Formato do pacote" title="Última leitura recebida" />
          <pre className="packet-preview">
            {JSON.stringify(
              samplePacket && {
                deviceId: samplePacket.deviceId,
                sourceId: samplePacket.sourceId,
                sensor: samplePacket.sensor,
                timestamp: new Date(samplePacket.timestamp).toISOString(),
                value: samplePacket.value,
              },
              null,
              2,
            )}
          </pre>
          <p className="panel-note">
            Cada dispositivo envia um pacote por ciclo. O pipeline acrescenta a classificação de qualidade e o valor
            processado antes de organizar o registro do talhão.
          </p>
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadFile('agrosmart-serie-temporal.csv', historyToCsv(state.history), 'text/csv')}
            >
              <Download aria-hidden="true" />
              Série temporal (CSV)
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => downloadFile('agrosmart-eventos.json', eventsToJson(state.events), 'application/json')}
            >
              <Download aria-hidden="true" />
              Eventos (JSON)
            </button>
          </div>
        </section>
      </div>

      <section className="panel">
        <SectionHeading eyebrow={`Ciclo de ${formatDateTime(state.time)}`} title="Dispositivos e processamento" />
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Dispositivo</th>
                <th scope="col">Origem</th>
                <th scope="col">Leitura bruta</th>
                <th scope="col">Valor processado</th>
                <th scope="col">Qualidade</th>
                <th scope="col">Falhas seguidas</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((reading) => {
                const spec = sensorSpecs[reading.sensor]
                const device = state.pipeline.devices[reading.deviceId]
                return (
                  <tr key={reading.deviceId}>
                    <th scope="row">
                      {reading.deviceId}
                      <small>{spec.label}</small>
                    </th>
                    <td>{reading.sourceId === 'estacao' ? 'Estação' : plotById[reading.sourceId].name}</td>
                    <td>{reading.value === null ? 'sem resposta' : `${formatNumber(reading.value, spec.decimals)} ${spec.unit}`}</td>
                    <td>
                      {formatNumber(reading.processed, spec.decimals)} {spec.unit}
                    </td>
                    <td>
                      <StatusPill tone={flagTone[reading.flag]} text={flagLabels[reading.flag]} />
                    </td>
                    <td>{device?.consecutiveInvalid ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Equipe" title="Integrantes do projeto" />
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
