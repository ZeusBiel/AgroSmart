import { CloudRain, Droplets, HeartPulse, Sprout, Sun, Thermometer } from 'lucide-react'
import { EventLog } from '../components/EventLog'
import { FarmMap } from '../components/FarmMap'
import { InsightList } from '../components/InsightList'
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart'
import { healthLabel, healthTone } from '../components/tones'
import { MetricCard, RangeBar, SectionHeading, StatusPill } from '../components/ui'
import { CALENDAR_IRRIGATION_MM_DAY, crops, plots } from '../domain/farm'
import { formatHours, formatNumber, formatSigned } from '../lib/format'
import type { PlatformState } from '../platform/platform'
import { plotSeries } from '../platform/selectors'
import { lastHours } from '../pipeline/timeSeries'

const fungalLabel = { low: 'baixo', medium: 'moderado', high: 'alto' } as const

export function OverviewScreen({
  state,
  onOpenPlot,
}: {
  state: PlatformState
  onOpenPlot: (plotId: string) => void
}) {
  const { analysis, insights } = state
  const { kpis, weather } = analysis
  const alerts = insights.filter((insight) => insight.severity === 'critical' || insight.severity === 'warning')
  const window48h = lastHours(state.history, 48)
  const healthy = Object.values(analysis.plots).filter((plot) => plot.health.status === 'good').length

  return (
    <section className="screen-stack">
      <section className="metrics-grid" aria-label="Indicadores da fazenda">
        <MetricCard
          icon={HeartPulse}
          label="Saúde média dos talhões"
          value={`${kpis.averageHealth}/100`}
          meta={`${healthy} de ${plots.length} talhões saudáveis`}
          tone={kpis.averageHealth >= 80 ? 'success' : kpis.averageHealth >= 60 ? 'warning' : 'critical'}
        />
        <MetricCard
          icon={Sprout}
          label="Umidade na faixa ideal"
          value={`${kpis.plotsInIdealRange} de ${plots.length}`}
          meta={`Desvio médio da meta: ${formatSigned(kpis.averageMoistureGap)} p.p.`}
          tone={kpis.plotsInIdealRange === plots.length ? 'success' : 'warning'}
        />
        <MetricCard
          icon={Droplets}
          label="Água aplicada (24 h)"
          value={`${formatNumber(kpis.irrigation24hM3, 0)} m³`}
          meta={
            kpis.savings24hM3 >= 0
              ? `${formatNumber(kpis.savingsPct, 0)}% menos que ${CALENDAR_IRRIGATION_MM_DAY} mm/dia fixos`
              : `${formatNumber(-kpis.savingsPct, 0)}% acima de ${CALENDAR_IRRIGATION_MM_DAY} mm/dia fixos`
          }
          tone={kpis.savings24hM3 >= 0 ? 'success' : 'warning'}
        />
        <MetricCard
          icon={alerts.length ? Thermometer : Sun}
          label="Alertas ativos"
          value={String(alerts.length)}
          meta={alerts.length ? alerts[0].title : 'Nenhuma ação urgente'}
          tone={alerts.some((a) => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'success'}
        />
      </section>

      <section className="weather-strip" aria-label="Clima agora">
        <div>
          <span>Ar</span>
          <strong>{formatNumber(weather.current.airTemperature)} °C</strong>
        </div>
        <div>
          <span>Umidade do ar</span>
          <strong>{formatNumber(weather.current.airHumidity, 0)}%</strong>
        </div>
        <div>
          <span>Radiação</span>
          <strong>{formatNumber(weather.current.solarRadiation, 0)} W/m²</strong>
        </div>
        <div>
          <span>Chuva 24 h</span>
          <strong>
            {weather.rainingNow && <CloudRain aria-hidden="true" />}
            {formatNumber(weather.rain24h)} mm
          </strong>
        </div>
        <div>
          <span>ET0 24 h</span>
          <strong>{formatNumber(weather.et0Last24h)} mm</strong>
        </div>
        <div>
          <span>Risco fúngico</span>
          <strong>{fungalLabel[weather.fungalRisk]}</strong>
        </div>
      </section>

      <section className="overview-grid">
        <div className="panel">
          <SectionHeading eyebrow="Mapa da fazenda" title="Talhões monitorados" />
          <FarmMap analysis={analysis} onSelect={onOpenPlot} />
          <p className="panel-note">Selecione um talhão para abrir a análise detalhada.</p>
        </div>
        <div className="panel">
          <SectionHeading eyebrow="Apoio à decisão" title="Recomendações" />
          <InsightList insights={insights} limit={5} />
        </div>
      </section>

      <TimeSeriesChart
        title="Umidade do solo por talhão"
        subtitle="Últimas 48 h, % volumétrica após limpeza e suavização"
        unit="%"
        series={plots.map((plot) => ({
          id: plot.id,
          label: `${plot.name} · ${crops[plot.cropId].name}`,
          color: plot.color,
          points: plotSeries(window48h, plot.id, 'soilMoisture'),
        }))}
      />

      <section className="plot-grid" aria-label="Resumo por talhão">
        {plots.map((plot) => {
          const result = analysis.plots[plot.id]
          const crop = crops[plot.cropId]
          return (
            <button className="plot-card" type="button" key={plot.id} onClick={() => onOpenPlot(plot.id)}>
              <span className="plot-card-head">
                <i className="plot-dot" style={{ background: plot.color }} aria-hidden="true" />
                <span>
                  <strong>
                    {plot.name} · {crop.name}
                  </strong>
                  <span>
                    {plot.areaHa} ha · {plot.irrigationSystem}
                  </span>
                </span>
              </span>
              <span className="plot-card-value">
                <span>
                  <strong>{formatNumber(result.moisture)}%</strong>
                  <span>
                    faixa {crop.moisture.min}–{crop.moisture.max}% · meta {crop.moisture.target}%
                  </span>
                </span>
                <StatusPill tone={healthTone[result.health.status]} text={`${healthLabel[result.health.status]} ${result.health.score}`} />
              </span>
              <RangeBar
                value={result.moisture}
                scale={[15, 45]}
                ideal={[crop.moisture.min, crop.moisture.max]}
                target={crop.moisture.target}
                color={plot.color}
                label={`Umidade ${formatNumber(result.moisture)}% na escala de 15 a 45%`}
              />
              <span className="plot-card-foot">
                <StatusPill tone={result.valveOpen ? 'success' : 'neutral'} text={result.valveOpen ? 'Irrigando' : 'Válvula fechada'} />
                <span>
                  {result.hoursToMin === null ? 'Sem previsão de déficit' : `Mínimo em ${formatHours(result.hoursToMin)}`}
                </span>
              </span>
            </button>
          )
        })}
      </section>

      <section className="panel">
        <SectionHeading eyebrow="Registro operacional" title="Últimos eventos" />
        <EventLog events={state.events.slice(0, 6)} />
      </section>
    </section>
  )
}
