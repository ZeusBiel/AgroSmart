import type { KeyboardEvent, PointerEvent } from 'react'
import { useMemo, useState } from 'react'
import { formatDateTime, formatDay, formatNumber, formatTime } from '../../lib/format'
import { hourOfDay } from '../../lib/time'
import { linearScale, nearestIndex, niceTicks } from './scale'
import { useElementWidth } from './useElementWidth'

export interface ChartSeries {
  id: string
  label: string
  color: string
  points: Array<{ t: number; v: number }>
  /** `forecast` = tracejada (projeção); `reference` = cinza de contexto */
  variant?: 'solid' | 'forecast' | 'reference'
}

interface TimeSeriesChartProps {
  title: string
  subtitle?: string
  series: ChartSeries[]
  unit: string
  decimals?: number
  band?: { min: number; max: number; label: string }
  spans?: Array<{ start: number; end: number }>
  spanLabel?: string
  now?: number
  height?: number
}

const MARGIN = { top: 14, right: 58, bottom: 28, left: 44 }
const HOUR = 3_600_000

function timeTicks(start: number, end: number) {
  const hours = (end - start) / HOUR
  const step = hours <= 14 ? 2 : hours <= 26 ? 4 : hours <= 50 ? 8 : 12
  const ticks: number[] = []
  let t = Math.ceil(start / HOUR) * HOUR
  while (t <= end) {
    if (Math.round(hourOfDay(t)) % step === 0) ticks.push(t)
    t += HOUR
  }
  return ticks
}

const tickLabel = (t: number) => (Math.round(hourOfDay(t)) === 0 ? formatDay(t) : `${formatTime(t).slice(0, 2)}h`)

export function TimeSeriesChart({
  title,
  subtitle,
  series,
  unit,
  decimals = 1,
  band,
  spans = [],
  spanLabel = 'Irrigação',
  now,
  height = 240,
}: TimeSeriesChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const plotWidth = width - MARGIN.left - MARGIN.right
  const plotHeight = height - MARGIN.top - MARGIN.bottom

  const model = useMemo(() => {
    const all = series.flatMap((s) => s.points)
    const times = [...new Set(all.map((p) => p.t))].sort((a, b) => a - b)
    const values = all.map((p) => p.v)
    if (band) values.push(band.min, band.max)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const pad = Math.max((max - min) * 0.08, 0.5 * 10 ** -decimals)
    const y = niceTicks(min - pad, max + pad, 4)
    const xDomain: [number, number] = [times[0] ?? 0, times[times.length - 1] ?? 1]
    const lookup = new Map(series.map((s) => [s.id, new Map(s.points.map((p) => [p.t, p.v]))]))
    return { times, y, xDomain, lookup }
  }, [series, band, decimals])

  const x = linearScale(model.xDomain, [0, plotWidth])
  const y = linearScale(model.y.domain, [plotHeight, 0])
  const xTicks = timeTicks(model.xDomain[0], model.xDomain[1])

  const paths = series.map((s) => ({
    ...s,
    d: s.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(''),
  }))

  const endLabels = series
    .filter((s) => s.variant !== 'forecast' && s.points.length > 0)
    .map((s) => {
      const last = s.points[s.points.length - 1]
      return { id: s.id, color: s.color, x: x(last.t), y: y(last.v), value: last.v }
    })
    .sort((a, b) => a.y - b.y)
  const labelsCollide = endLabels.some((label, i) => i > 0 && label.y - endLabels[i - 1].y < 14)
  const showEndLabels = endLabels.length <= 4 && !labelsCollide

  const hoverTime = hoverIndex === null ? null : model.times[hoverIndex]
  const hoverRows =
    hoverTime === null
      ? []
      : series
          .map((s) => ({ series: s, value: model.lookup.get(s.id)?.get(hoverTime) }))
          .filter((row): row is { series: ChartSeries; value: number } => row.value !== undefined)

  function handlePointer(event: PointerEvent<SVGRectElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const t = model.xDomain[0] + ((event.clientX - bounds.left) / bounds.width) * (model.xDomain[1] - model.xDomain[0])
    setHoverIndex(nearestIndex(model.times, t))
  }

  function handleKey(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') return setHoverIndex(null)
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    setHoverIndex((current) =>
      Math.min(model.times.length - 1, Math.max(0, (current ?? model.times.length - 1) + step)),
    )
  }

  const showLegend = series.length > 1 || spans.length > 0 || !!band
  const tooltipLeft = hoverTime === null ? 0 : MARGIN.left + x(hoverTime)
  const tableRows = model.times.filter((_, i) => i % 6 === 0 || i === model.times.length - 1)

  return (
    <figure className="chart-card">
      <figcaption className="chart-heading">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </figcaption>

      {showLegend && (
        <ul className="chart-legend">
          {series.map((s) => (
            <li key={s.id}>
              <i
                className={`legend-line ${s.variant ?? 'solid'}`}
                style={{ borderColor: s.variant === 'reference' ? undefined : s.color }}
              />
              {s.label}
            </li>
          ))}
          {band && (
            <li>
              <i className="legend-band" />
              {band.label}
            </li>
          )}
          {spans.length > 0 && (
            <li>
              <i className="legend-span" />
              {spanLabel}
            </li>
          )}
        </ul>
      )}

      <div className="chart-frame" ref={containerRef}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${title}. Use as setas para percorrer os pontos.`}
          tabIndex={0}
          onKeyDown={handleKey}
          onBlur={() => setHoverIndex(null)}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {band && (
              <g>
                <rect
                  className="chart-band"
                  x={0}
                  width={plotWidth}
                  y={y(band.max)}
                  height={Math.max(0, y(band.min) - y(band.max))}
                />
              </g>
            )}

            {model.y.ticks.map((tick) => (
              <g key={tick}>
                <line className="chart-grid" x1={0} x2={plotWidth} y1={y(tick)} y2={y(tick)} />
                <text className="chart-axis-label" x={-8} y={y(tick)} dy="0.32em" textAnchor="end">
                  {formatNumber(tick, model.y.step < 1 ? (model.y.step < 0.1 ? 2 : 1) : 0)}
                </text>
              </g>
            ))}

            {xTicks.map((tick) => (
              <text key={tick} className="chart-axis-label" x={x(tick)} y={plotHeight + 18} textAnchor="middle">
                {tickLabel(tick)}
              </text>
            ))}

            <line className="chart-baseline" x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} />

            {spans.map((span) => (
              <rect
                key={span.start}
                className="chart-span"
                x={x(Math.max(span.start, model.xDomain[0]))}
                width={Math.max(2, x(Math.min(span.end, model.xDomain[1])) - x(Math.max(span.start, model.xDomain[0])))}
                y={plotHeight - 6}
                height={6}
                rx={2}
              />
            ))}

            {now !== undefined && now < model.xDomain[1] && (
              <g>
                <line className="chart-now" x1={x(now)} x2={x(now)} y1={0} y2={plotHeight} />
                <text className="chart-axis-label" x={x(now) + 4} y={10}>
                  agora
                </text>
              </g>
            )}

            {paths.map((s) => (
              <path
                key={s.id}
                d={s.d}
                fill="none"
                stroke={s.variant === 'reference' ? 'var(--chart-reference)' : s.color}
                strokeWidth={s.variant === 'reference' ? 1.5 : 2}
                strokeDasharray={s.variant === 'forecast' ? '5 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {showEndLabels &&
              endLabels.map((label) => (
                <g key={label.id}>
                  <circle cx={label.x} cy={label.y} r={4} fill={label.color} stroke="var(--surface)" strokeWidth={2} />
                  <text className="chart-end-label" x={label.x + 8} y={label.y} dy="0.32em">
                    {formatNumber(label.value, decimals)}
                  </text>
                </g>
              ))}

            {hoverTime !== null && (
              <g pointerEvents="none">
                <line className="chart-crosshair" x1={x(hoverTime)} x2={x(hoverTime)} y1={0} y2={plotHeight} />
                {hoverRows.map(({ series: s, value }) => (
                  <circle
                    key={s.id}
                    cx={x(hoverTime)}
                    cy={y(value)}
                    r={4}
                    fill={s.variant === 'reference' ? 'var(--chart-reference)' : s.color}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                ))}
              </g>
            )}

            <rect
              x={0}
              y={0}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onPointerMove={handlePointer}
              onPointerLeave={() => setHoverIndex(null)}
            />
          </g>
        </svg>

        {hoverTime !== null && hoverRows.length > 0 && (
          <div
            className="chart-tooltip"
            style={{
              left: tooltipLeft,
              transform: tooltipLeft > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <span className="tooltip-time">{formatDateTime(hoverTime)}</span>
            {hoverRows.map(({ series: s, value }) => (
              <span className="tooltip-row" key={s.id}>
                <i
                  className={`legend-line ${s.variant ?? 'solid'}`}
                  style={{ borderColor: s.variant === 'reference' ? undefined : s.color }}
                />
                <strong>
                  {formatNumber(value, decimals)} {unit}
                </strong>
                <span>{s.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <details className="chart-table">
        <summary>Ver dados em tabela</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Horário</th>
                {series.map((s) => (
                  <th scope="col" key={s.id}>
                    {s.label} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((t) => (
                <tr key={t}>
                  <td>{formatDateTime(t)}</td>
                  {series.map((s) => {
                    const value = model.lookup.get(s.id)?.get(t)
                    return <td key={s.id}>{value === undefined ? '—' : formatNumber(value, decimals)}</td>
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
