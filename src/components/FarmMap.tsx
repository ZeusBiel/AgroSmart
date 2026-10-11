import type { FarmAnalysis } from '../analytics/analysis'
import { crops, plots } from '../domain/farm'
import { formatNumber } from '../lib/format'
import { healthLabel } from './tones'

/** Mapa esquemático da fazenda: cada talhão mostra umidade, saúde e irrigação. */
export function FarmMap({
  analysis,
  selectedPlotId,
  onSelect,
}: {
  analysis: FarmAnalysis
  selectedPlotId?: string
  onSelect: (plotId: string) => void
}) {
  return (
    <svg className="farm-map" viewBox="0 0 600 320" role="group" aria-label="Mapa dos talhões da fazenda">
      <defs>
        <pattern id="crop-rows" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" className="map-rows" />
        </pattern>
      </defs>

      <g className="map-facility">
        <path d="M404,186 L576,180 L580,304 L408,306 Z" />
        <ellipse cx="530" cy="280" rx="34" ry="16" className="map-reservoir" />
        <text x="420" y="214" className="map-caption">
          Sede e reservatório
        </text>
        <text x="420" y="232" className="map-subcaption">
          Estação meteorológica
        </text>
        <text x="420" y="248" className="map-subcaption">
          Gateway LoRaWAN
        </text>
      </g>

      {plots.map((plot) => {
        const result = analysis.plots[plot.id]
        const crop = crops[plot.cropId]
        const selected = plot.id === selectedPlotId
        const { x, y } = plot.mapLabel
        return (
          <g
            key={plot.id}
            className={`map-plot${selected ? ' selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${plot.name}, ${crop.name}: umidade ${formatNumber(result.moisture)}%, ${healthLabel[result.health.status]}${result.valveOpen ? ', irrigando' : ''}`}
            onClick={() => onSelect(plot.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(plot.id)
              }
            }}
          >
            <path d={plot.mapPath} fill={plot.color} className="map-fill" />
            <path d={plot.mapPath} fill="url(#crop-rows)" className="map-texture" />
            <path d={plot.mapPath} stroke={plot.color} className="map-outline" />
            {result.valveOpen && <path d={plot.mapPath} className="map-irrigating" />}

            <text x={x} y={y - 18} textAnchor="middle" className="map-caption">
              {plot.name} · {crop.name}
            </text>
            <text x={x} y={y + 6} textAnchor="middle" className="map-value">
              {formatNumber(result.moisture)}%
            </text>
            <text x={x} y={y + 24} textAnchor="middle" className="map-subcaption">
              {result.valveOpen ? 'Irrigando' : healthLabel[result.health.status]} · saúde {result.health.score}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
