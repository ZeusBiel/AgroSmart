import { useState } from 'react'
import { formatNumber } from '../../lib/format'
import { linearScale, niceTicks } from './scale'
import { useElementWidth } from './useElementWidth'

interface ColumnSeries {
  id: string
  label: string
  color: string
}

interface ColumnBucket {
  key: string
  label: string
  tooltipLabel: string
  values: number[]
}

interface StackedColumnChartProps {
  title: string
  subtitle?: string
  series: ColumnSeries[]
  buckets: ColumnBucket[]
  unit: string
  decimals?: number
  height?: number
}

const MARGIN = { top: 14, right: 12, bottom: 28, left: 44 }
const GAP = 2
const MAX_COLUMN = 24
const RADIUS = 4

/** Coluna com cantos de 4 px apenas no topo (a base fica reta no eixo). */
function topRoundedRect(x: number, y: number, width: number, height: number) {
  const r = Math.min(RADIUS, width / 2, height)
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`
}

export function StackedColumnChart({
  title,
  subtitle,
  series,
  buckets,
  unit,
  decimals = 1,
  height = 220,
}: StackedColumnChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const plotWidth = width - MARGIN.left - MARGIN.right
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const totals = buckets.map((bucket) => bucket.values.reduce((sum, value) => sum + value, 0))
  const y = niceTicks(0, Math.max(1, ...totals), 4)
  const scaleY = linearScale(y.domain, [plotHeight, 0])
  const slot = plotWidth / Math.max(1, buckets.length)
  const columnWidth = Math.max(3, Math.min(MAX_COLUMN, slot - GAP * 2))
  const labelEvery = Math.ceil(buckets.length / Math.max(1, Math.floor(plotWidth / 56)))
  const hovered = hover === null ? null : buckets[hover]
  const tooltipLeft = hover === null ? 0 : MARGIN.left + slot * hover + slot / 2

  return (
    <figure className="chart-card">
      <figcaption className="chart-heading">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
      </figcaption>

      <ul className="chart-legend">
        {series.map((s) => (
          <li key={s.id}>
            <i className="legend-swatch" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      <div className="chart-frame" ref={containerRef}>
        <svg width={width} height={height} role="img" aria-label={title}>
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {y.ticks.map((tick) => (
              <g key={tick}>
                <line className="chart-grid" x1={0} x2={plotWidth} y1={scaleY(tick)} y2={scaleY(tick)} />
                <text className="chart-axis-label" x={-8} y={scaleY(tick)} dy="0.32em" textAnchor="end">
                  {formatNumber(tick, y.step < 1 ? 1 : 0)}
                </text>
              </g>
            ))}

            {buckets.map((bucket, index) => {
              const x = slot * index + (slot - columnWidth) / 2
              let base = plotHeight
              const visible = bucket.values
                .map((value, seriesIndex) => ({ value, seriesIndex }))
                .filter((segment) => segment.value > 0)

              return (
                <g
                  key={bucket.key}
                  tabIndex={0}
                  role="img"
                  aria-label={`${bucket.tooltipLabel}: ${series
                    .map((s, i) => `${s.label} ${formatNumber(bucket.values[i], decimals)} ${unit}`)
                    .join(', ')}`}
                  onPointerEnter={() => setHover(index)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  opacity={hover === null || hover === index ? 1 : 0.55}
                >
                  <rect x={slot * index} y={0} width={slot} height={plotHeight} fill="transparent" />
                  {visible.map((segment, i) => {
                    const segmentHeight = plotHeight - scaleY(segment.value)
                    const gap = i > 0 ? GAP : 0
                    const top = base - segmentHeight
                    const drawHeight = Math.max(1, segmentHeight - gap)
                    const isTop = i === visible.length - 1
                    base = top
                    return isTop ? (
                      <path
                        key={segment.seriesIndex}
                        d={topRoundedRect(x, top, columnWidth, drawHeight)}
                        fill={series[segment.seriesIndex].color}
                      />
                    ) : (
                      <rect
                        key={segment.seriesIndex}
                        x={x}
                        y={top}
                        width={columnWidth}
                        height={drawHeight}
                        fill={series[segment.seriesIndex].color}
                      />
                    )
                  })}
                  {index % labelEvery === 0 && (
                    <text className="chart-axis-label" x={slot * index + slot / 2} y={plotHeight + 18} textAnchor="middle">
                      {bucket.label}
                    </text>
                  )}
                </g>
              )
            })}

            <line className="chart-baseline" x1={0} x2={plotWidth} y1={plotHeight} y2={plotHeight} />
          </g>
        </svg>

        {hovered && (
          <div
            className="chart-tooltip"
            style={{
              left: tooltipLeft,
              transform: tooltipLeft > width / 2 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            }}
          >
            <span className="tooltip-time">{hovered.tooltipLabel}</span>
            {series.map((s, i) => (
              <span className="tooltip-row" key={s.id}>
                <i className="legend-swatch" style={{ background: s.color }} />
                <strong>
                  {formatNumber(hovered.values[i], decimals)} {unit}
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
                <th scope="col">Período</th>
                {series.map((s) => (
                  <th scope="col" key={s.id}>
                    {s.label} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.key}>
                  <td>{bucket.tooltipLabel}</td>
                  {bucket.values.map((value, i) => (
                    <td key={series[i].id}>{formatNumber(value, decimals)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  )
}
