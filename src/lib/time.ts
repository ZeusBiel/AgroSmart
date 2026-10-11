const HOUR_MS = 3_600_000
/** Brasília (UTC-3, sem horário de verão desde 2019) */
const BRT_OFFSET_HOURS = -3

/** Hora local decimal (0-24) do timestamp no fuso da fazenda. */
export function hourOfDay(timestamp: number) {
  const hours = timestamp / HOUR_MS + BRT_OFFSET_HOURS
  return ((hours % 24) + 24) % 24
}

export const hoursToMs = (hours: number) => hours * HOUR_MS
