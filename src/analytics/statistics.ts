// Funções estatísticas usadas pelas análises automatizadas.

export interface Descriptive {
  count: number
  min: number
  max: number
  mean: number
  stdDev: number
  last: number
}

export function describe(values: number[]): Descriptive {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, stdDev: 0, last: 0 }
  }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
    sum += value
  }
  const mean = sum / values.length
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length
  return { count: values.length, min, max, mean, stdDev: Math.sqrt(variance), last: values[values.length - 1] }
}

export interface Trend {
  slope: number
  intercept: number
  /** Coeficiente de determinação (0-1): quão bem a reta explica os dados */
  r2: number
}

/** Regressão linear por mínimos quadrados. */
export function linearTrend(points: Array<{ x: number; y: number }>): Trend {
  const n = points.length
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, r2: 0 }

  const meanX = points.reduce((acc, p) => acc + p.x, 0) / n
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const { x, y } of points) {
    sxx += (x - meanX) ** 2
    sxy += (x - meanX) * (y - meanY)
    syy += (y - meanY) ** 2
  }
  if (sxx === 0) return { slope: 0, intercept: meanY, r2: 0 }

  const slope = sxy / sxx
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { slope, intercept: meanY - slope * meanX, r2 }
}

/** Horas até `value` cruzar `threshold` mantida a tendência, ou null se não cruzar. */
export function hoursUntilThreshold(value: number, slopePerHour: number, threshold: number) {
  if (value <= threshold) return 0
  if (slopePerHour >= -0.05) return null
  return (value - threshold) / -slopePerHour
}
