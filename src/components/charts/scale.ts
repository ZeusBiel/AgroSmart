// Utilitários de escala compartilhados pelos gráficos SVG.

export const linearScale =
  (domain: [number, number], range: [number, number]) => (value: number) => {
    const [d0, d1] = domain
    const [r0, r1] = range
    if (d1 === d0) return (r0 + r1) / 2
    return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0)
  }

/** Ticks "redondos" (1, 2, 2,5, 5 x 10^n) cobrindo o intervalo. */
export function niceTicks(min: number, max: number, count = 4) {
  if (min === max) {
    min -= 1
    max += 1
  }
  const rough = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Math.round(value * 1e6) / 1e6)
  }
  return { ticks, domain: [start, end] as [number, number], step }
}

/** Índice do ponto mais próximo de `t` em uma lista ordenada de timestamps. */
export function nearestIndex(times: number[], t: number) {
  let low = 0
  let high = times.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (times[mid] < t) low = mid
    else high = mid
  }
  return Math.abs(times[low] - t) <= Math.abs(times[high] - t) ? low : high
}
