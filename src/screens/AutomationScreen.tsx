import type { LucideIcon } from 'lucide-react'
import { CloudRain, Flame, RadioTower, Waves } from 'lucide-react'
import { useState } from 'react'
import { EventLog } from '../components/EventLog'
import { SectionHeading, Segmented, StatusPill } from '../components/ui'
import { automationRules, type RuleCategory } from '../automation/rules'
import { crops, plots } from '../domain/farm'
import type { EventSource, ScenarioKind, ValveMode } from '../domain/types'
import { scenarioDescriptions } from '../iot/simulator'
import { formatDateTime, formatNumber, formatTime } from '../lib/format'
import type { PlatformState } from '../platform/platform'
import type { PlatformAction } from '../platform/usePlatform'

const categoryLabel: Record<RuleCategory, string> = {
  protecao: 'Proteção',
  irrigacao: 'Irrigação',
  alerta: 'Alerta',
}

const scenarios: Array<{ kind: ScenarioKind; label: string; icon: LucideIcon }> = [
  { kind: 'heavyRain', label: 'Chuva forte', icon: CloudRain },
  { kind: 'heatwave', label: 'Onda de calor', icon: Flame },
  { kind: 'highHumidity', label: 'Umidade alta', icon: Waves },
  { kind: 'sensorFault', label: 'Falha de sensor', icon: RadioTower },
]

type SourceFilter = 'all' | EventSource

const sourceFilters: Array<{ value: SourceFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'automacao', label: 'Automação' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'operador', label: 'Operador' },
  { value: 'simulacao', label: 'Simulação' },
]

export function AutomationScreen({
  state,
  dispatch,
}: {
  state: PlatformState
  dispatch: (action: PlatformAction) => void
}) {
  const [filter, setFilter] = useState<SourceFilter>('all')
  const events = filter === 'all' ? state.events : state.events.filter((event) => event.source === filter)

  return (
    <section className="screen-stack">
      <section className="panel">
        <SectionHeading eyebrow="Atuadores" title="Válvulas de irrigação" />
        <div className="valve-grid">
          {plots.map((plot) => {
            const valve = state.valves[plot.id]
            const result = state.analysis.plots[plot.id]
            const crop = crops[plot.cropId]
            return (
              <article className="valve-card" key={plot.id}>
                <div className="valve-head">
                  <i className="plot-dot" style={{ background: plot.color }} aria-hidden="true" />
                  <div>
                    <strong>
                      {plot.name} · {crop.name}
                    </strong>
                    <span>
                      {plot.irrigationSystem} · {plot.irrigationRateMmH} mm/h
                    </span>
                  </div>
                  <StatusPill tone={valve.open ? 'success' : 'neutral'} text={valve.open ? 'Aberta' : 'Fechada'} />
                </div>
                <dl className="valve-facts">
                  <div>
                    <dt>Umidade</dt>
                    <dd>{formatNumber(result.moisture)}%</dd>
                  </div>
                  <div>
                    <dt>Meta</dt>
                    <dd>{formatNumber(valve.targetMoisture ?? crop.moisture.target)}%</dd>
                  </div>
                  <div>
                    <dt>Aberta desde</dt>
                    <dd>{valve.openedAt ? formatTime(valve.openedAt) : '—'}</dd>
                  </div>
                </dl>
                <Segmented<ValveMode>
                  label={`Modo da válvula do ${plot.name}`}
                  value={valve.mode}
                  onChange={(mode) => dispatch({ type: 'setValveMode', plotId: plot.id, mode })}
                  options={[
                    { value: 'auto', label: 'Automático' },
                    { value: 'manual', label: 'Manual' },
                  ]}
                />
                <button
                  className="secondary-button"
                  type="button"
                  disabled={valve.mode !== 'manual'}
                  onClick={() => dispatch({ type: 'setValveOpen', plotId: plot.id, open: !valve.open })}
                >
                  {valve.open ? 'Fechar válvula' : 'Abrir válvula'}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Simulação de eventos do ambiente" title="Testar a resposta da plataforma" />
        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <button
              className="scenario-button"
              type="button"
              key={scenario.kind}
              onClick={() => dispatch({ type: 'scenario', kind: scenario.kind })}
            >
              <scenario.icon aria-hidden="true" />
              <span>
                <strong>{scenario.label}</strong>
                <small>{scenarioDescriptions[scenario.kind]}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Motor de regras" title="Regras de automação por prioridade" />
        <div className="table-scroll">
          <table className="data-table rules-table">
            <thead>
              <tr>
                <th scope="col">Regra</th>
                <th scope="col">Condição (a partir das análises)</th>
                <th scope="col">Ação</th>
                <th scope="col">Disparos</th>
                <th scope="col">Ativa</th>
              </tr>
            </thead>
            <tbody>
              {automationRules.map((rule) => {
                const stats = state.automation.stats[rule.id]
                const enabled = state.automation.enabled[rule.id]
                return (
                  <tr key={rule.id} className={enabled ? undefined : 'disabled'}>
                    <th scope="row">
                      <span className="rule-id">{rule.id}</span>
                      <strong>{rule.name}</strong>
                      <small>
                        {categoryLabel[rule.category]} · {rule.scope === 'farm' ? 'fazenda' : 'por talhão'}
                      </small>
                    </th>
                    <td>{rule.condition}</td>
                    <td>{rule.action}</td>
                    <td>
                      <strong>{stats.triggers}</strong>
                      <small>{stats.lastTriggered ? formatDateTime(stats.lastTriggered) : 'nunca'}</small>
                    </td>
                    <td>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={() => dispatch({ type: 'toggleRule', ruleId: rule.id })}
                        />
                        <span aria-hidden="true" />
                        <span className="sr-only">
                          {enabled ? 'Desativar' : 'Ativar'} {rule.name}
                        </span>
                      </label>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Rastreabilidade" title="Registro de decisões e eventos">
          <Segmented<SourceFilter> label="Filtrar por origem" value={filter} onChange={setFilter} options={sourceFilters} />
        </SectionHeading>
        <EventLog events={events.slice(0, 40)} emptyText="Nenhum evento desta origem." />
      </section>
    </section>
  )
}
