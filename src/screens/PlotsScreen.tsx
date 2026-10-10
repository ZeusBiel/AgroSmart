import { Droplets, FlaskConical, Gauge, HeartPulse, Thermometer, TrendingDown } from 'lucide-react'
import { useState } from 'react'
import { StackedColumnChart } from '../components/charts/StackedColumnChart'
import { TimeSeriesChart } from '../components/charts/TimeSeriesChart'
import { healthLabel, healthTone } from '../components/tones'
import { Meter, MetricCard, SectionHeading, Segmented } from '../components/ui'
import { crops, plotById, plots } from '../domain/farm'
import { formatHours, formatNumber, formatSigned } from '../lib/format'
import type { PlatformState } from '../platform/platform'
import { irrigationSpans, plotSeries, waterBuckets, weatherSeries, windowStatistics } from '../platform/selectors'
import { lastHours } from '../pipeline/timeSeries'

const WINDOWS = [12, 24, 48, 72] as const
const RAIN_COLOR = '#8f9a9e'

export function PlotsScreen({
  state,
  plotId,
  onSelectPlot,
}: {
  state: PlatformState
  plotId: string
  onSelectPlot: (plotId: string) => void
}) {
  const [hours, setHours] = useState<number>(24)
  const plot = plotById[plotId]
  const crop = crops[plot.cropId]
  const result = state.analysis.plots[plotId]
  const window = lastHours(state.history, hours)
  const water = result.water24h
  const bucketHours = hours <= 24 ? 1 : hours <= 48 ? 2 : 3

  const healthComponents = [
    { label: 'Umidade do solo', weight: 45, value: result.health.components.moisture },
    { label: 'pH do solo', weight: 20, value: result.health.components.ph },
    { label: 'Conforto térmico', weight: 15, value: result.health.components.thermal },
    { label: 'Qualidade dos dados', weight: 20, value: result.health.components.quality },
  ]

  return (
    <section className="screen-stack">
      <div className="filter-row">
        <Segmented
          label="Talhão"
          value={plotId}
          onChange={onSelectPlot}
          options={plots.map((candidate) => ({
            value: candidate.id,
            label: (
              <>
                <i className="plot-dot" style={{ background: candidate.color }} aria-hidden="true" />
                {candidate.name} · {crops[candidate.cropId].name}
              </>
            ),
          }))}
        />
        <Segmented
          label="Janela de tempo"
          value={hours}
          onChange={setHours}
          options={WINDOWS.map((value) => ({ value, label: `${value} h` }))}
        />
      </div>

      <section className="metrics-grid six" aria-label={`Indicadores do ${plot.name}`}>
        <MetricCard
          icon={Droplets}
          label="Umidade do solo"
          value={`${formatNumber(result.moisture)}%`}
          meta={`Tendência ${formatSigned(result.moistureTrend, 2)} p.p./h (3 h)`}
          tone={result.moistureStatus === 'dry' ? 'critical' : result.moistureStatus === 'wet' ? 'warning' : 'success'}
        />
        <MetricCard
          icon={TrendingDown}
          label="Previsão de déficit"
          value={result.hoursToMin === null ? 'Sem déficit' : formatHours(result.hoursToMin)}
          meta={
            result.forecastMethod === 'water-balance'
              ? `Balanço hídrico · solo ${formatNumber(result.soilResponse, 2)} p.p./mm`
              : 'Tendência linear (histórico curto)'
          }
          tone={result.hoursToMin !== null && result.hoursToMin <= 6 ? 'warning' : 'neutral'}
        />
        <MetricCard
          icon={Gauge}
          label="Balanço hídrico 24 h"
          value={`${formatSigned(water.balanceMm)} mm`}
          meta={`Chuva ${formatNumber(water.rainMm)} + irrigação ${formatNumber(water.irrigationMm)} − ETc ${formatNumber(water.cropEtMm)}`}
          tone={water.balanceMm < -3 ? 'warning' : 'neutral'}
        />
        <MetricCard
          icon={FlaskConical}
          label="pH do solo"
          value={formatNumber(result.soilPH, 2)}
          meta={`Faixa ${formatNumber(crop.ph.min)}–${formatNumber(crop.ph.max)}`}
          tone={result.phStatus === 'ok' ? 'success' : 'warning'}
        />
        <MetricCard
          icon={Thermometer}
          label="Temperatura do solo"
          value={`${formatNumber(result.soilTemperature)} °C`}
          meta={`Ar ${formatNumber(state.analysis.weather.current.airTemperature)} °C · limite ${crop.airTemperature.max} °C`}
          tone={result.heatStressHours >= 1 ? 'warning' : 'neutral'}
        />
        <MetricCard
          icon={HeartPulse}
          label="Índice de saúde"
          value={`${result.health.score}/100`}
          meta={healthLabel[result.health.status]}
          tone={healthTone[result.health.status]}
        />
      </section>

      <TimeSeriesChart
        title={`Umidade do solo · ${plot.name} (${crop.name})`}
        subtitle={`Medição das últimas ${hours} h e projeção de 12 h por balanço hídrico, caso nenhuma irrigação ocorra`}
        unit="%"
        band={{ min: crop.moisture.min, max: crop.moisture.max, label: `Faixa ideal ${crop.moisture.min}–${crop.moisture.max}%` }}
        spans={irrigationSpans(window, plotId)}
        now={state.analysis.timestamp}
        height={280}
        series={[
          { id: 'measured', label: 'Medida', color: plot.color, points: plotSeries(window, plotId, 'soilMoisture') },
          ...(result.forecast.length > 1
            ? [{ id: 'forecast', label: 'Previsão sem irrigar', color: plot.color, points: result.forecast, variant: 'forecast' as const }]
            : []),
        ]}
      />

      <div className="chart-pair">
        <TimeSeriesChart
          title="Temperatura do solo e do ar"
          subtitle={`Últimas ${hours} h, °C`}
          unit="°C"
          series={[
            { id: 'soil', label: 'Solo', color: plot.color, points: plotSeries(window, plotId, 'soilTemperature') },
            { id: 'air', label: 'Ar (estação)', color: RAIN_COLOR, points: weatherSeries(window, 'airTemperature'), variant: 'reference' },
          ]}
        />
        <StackedColumnChart
          title="Entradas de água"
          subtitle={`Lâmina em mm a cada ${bucketHours} h`}
          unit="mm"
          series={[
            { id: 'rain', label: 'Chuva', color: RAIN_COLOR },
            { id: 'irrigation', label: 'Irrigação', color: plot.color },
          ]}
          buckets={waterBuckets(window, plotId, bucketHours)}
        />
      </div>

      <div className="chart-pair">
        <TimeSeriesChart
          title="pH do solo"
          subtitle={`Últimas ${hours} h`}
          unit="pH"
          decimals={2}
          band={{ min: crop.ph.min, max: crop.ph.max, label: 'Faixa ideal' }}
          series={[{ id: 'ph', label: 'pH', color: plot.color, points: plotSeries(window, plotId, 'soilPH') }]}
        />
        <section className="panel">
          <SectionHeading eyebrow="Composição" title="Índice de saúde do talhão" />
          <ul className="health-list">
            {healthComponents.map((component) => (
              <li key={component.label}>
                <div className="split-row">
                  <span>
                    {component.label} <small>peso {component.weight}%</small>
                  </span>
                  <strong>{formatNumber(component.value, 0)}</strong>
                </div>
                <Meter
                  value={component.value}
                  tone={component.value >= 80 ? 'success' : component.value >= 60 ? 'warning' : 'critical'}
                />
              </li>
            ))}
          </ul>
          <p className="panel-note">
            Qualidade dos dados nas últimas 24 h: {formatNumber(result.dataQuality, 1)}% das leituras sem correção.
            Estresse térmico: {formatHours(result.heatStressHours)} acima de {crop.airTemperature.max} °C.
          </p>
        </section>
      </div>

      <section className="panel">
        <SectionHeading eyebrow="Estatística descritiva" title={`Variáveis nas últimas ${hours} h`} />
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Variável</th>
                <th scope="col">Mínimo</th>
                <th scope="col">Média</th>
                <th scope="col">Máximo</th>
                <th scope="col">Desvio padrão</th>
                <th scope="col">Atual</th>
              </tr>
            </thead>
            <tbody>
              {windowStatistics(state.history, plotId, hours).map(({ field, spec, stats }) => (
                <tr key={field}>
                  <th scope="row">
                    {spec.label} <small>{spec.unit}</small>
                  </th>
                  <td>{formatNumber(stats.min, spec.decimals)}</td>
                  <td>{formatNumber(stats.mean, spec.decimals)}</td>
                  <td>{formatNumber(stats.max, spec.decimals)}</td>
                  <td>{formatNumber(stats.stdDev, spec.decimals)}</td>
                  <td>{formatNumber(stats.last, spec.decimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
