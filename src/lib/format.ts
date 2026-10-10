const TIME_ZONE = 'America/Sao_Paulo'

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: TIME_ZONE,
})

const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: TIME_ZONE,
})

const numberFormatters = new Map<number, Intl.NumberFormat>()

export function formatNumber(value: number, decimals = 1) {
  let formatter = numberFormatters.get(decimals)
  if (!formatter) {
    formatter = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    numberFormatters.set(decimals, formatter)
  }
  return formatter.format(value)
}

export const formatTime = (timestamp: number) => timeFormatter.format(timestamp)
export const formatDateTime = (timestamp: number) => dateTimeFormatter.format(timestamp)
export const formatDay = (timestamp: number) => dayFormatter.format(timestamp)

export function formatHours(hours: number) {
  if (hours <= 0) return '0 h'
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))} min`
  }
  return `${formatNumber(hours, hours < 10 ? 1 : 0)} h`
}

export function formatSigned(value: number, decimals = 1) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatNumber(Math.abs(value), decimals)}`
}
