import type { PlatformEvent } from '../domain/types'
import { plotById } from '../domain/farm'
import { formatDateTime } from '../lib/format'
import { SeverityIcon } from './ui'

const sourceLabel: Record<PlatformEvent['source'], string> = {
  automacao: 'Automação',
  pipeline: 'Pipeline',
  operador: 'Operador',
  simulacao: 'Simulação',
}

export function EventLog({ events, emptyText = 'Nenhum evento registrado.' }: { events: PlatformEvent[]; emptyText?: string }) {
  if (events.length === 0) return <p className="empty-state">{emptyText}</p>

  return (
    <ol className="event-list">
      {events.map((event) => (
        <li className={`event-item ${event.severity}`} key={event.id}>
          <SeverityIcon severity={event.severity} />
          <div>
            <strong>{event.message}</strong>
            {event.detail && <p>{event.detail}</p>}
            <span>
              {formatDateTime(event.timestamp)} · {sourceLabel[event.source]}
              {event.ruleId && ` · ${event.ruleId}`}
              {event.plotId && ` · ${plotById[event.plotId]?.name}`}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}
