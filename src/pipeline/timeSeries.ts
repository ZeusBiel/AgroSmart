// Armazenamento da série temporal em memória e consultas usadas pela análise
// e pelos gráficos (janelas de tempo e agregação em intervalos).

import { HISTORY_TICKS, TICKS_PER_HOUR } from '../domain/farm'
import type { TickRecord } from '../domain/types'
import { hoursToMs } from '../lib/time'

export function appendRecord(history: TickRecord[], record: TickRecord, retention = HISTORY_TICKS) {
  const next = history.length >= retention ? history.slice(history.length - retention + 1) : history.slice()
  next.push(record)
  return next
}

/** Registros das últimas `hours` horas (inclui o ciclo mais recente). */
export function lastHours(history: TickRecord[], hours: number) {
  const count = Math.round(hours * TICKS_PER_HOUR)
  return history.length > count ? history.slice(history.length - count) : history
}

export interface Bucket<T> {
  start: number
  end: number
  records: TickRecord[]
  value: T
}

/** Agrupa registros em intervalos fixos alinhados ao relógio. */
export function bucketize<T>(
  records: TickRecord[],
  bucketHours: number,
  reduce: (records: TickRecord[]) => T,
): Bucket<T>[] {
  if (records.length === 0) return []
  const size = hoursToMs(bucketHours)
  const groups = new Map<number, TickRecord[]>()

  for (const record of records) {
    const start = Math.floor(record.timestamp / size) * size
    const group = groups.get(start)
    if (group) group.push(record)
    else groups.set(start, [record])
  }

  return [...groups.entries()].map(([start, group]) => ({
    start,
    end: start + size,
    records: group,
    value: reduce(group),
  }))
}

export const sumOf = (values: number[]) => values.reduce((total, value) => total + value, 0)

export const meanOf = (values: number[]) => (values.length ? sumOf(values) / values.length : 0)
