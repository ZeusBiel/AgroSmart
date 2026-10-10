import type { Insight } from '../analytics/analysis'
import { plotById } from '../domain/farm'
import { SeverityIcon } from './ui'

export function InsightList({ insights, limit }: { insights: Insight[]; limit?: number }) {
  const visible = limit ? insights.slice(0, limit) : insights
  return (
    <ul className="insight-list">
      {visible.map((insight) => (
        <li className={`insight-item ${insight.severity}`} key={insight.id}>
          <SeverityIcon severity={insight.severity} />
          <div>
            <strong>{insight.title}</strong>
            <p>{insight.detail}</p>
            <p className="insight-action">
              {insight.plotId && (
                <i className="plot-dot" style={{ background: plotById[insight.plotId].color }} aria-hidden="true" />
              )}
              {insight.action}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
