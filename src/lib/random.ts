// Gerador pseudoaleatório determinístico (mulberry32): a mesma semente
// reproduz exatamente a mesma simulação, o que permite testes repetíveis.
export interface Rng {
  next: () => number
  normal: (mean?: number, sd?: number) => number
  range: (min: number, max: number) => number
  chance: (probability: number) => boolean
  pick: <T>(items: readonly T[]) => T
  readonly state: number
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    normal(mean = 0, sd = 1) {
      const u = Math.max(next(), Number.EPSILON)
      const v = next()
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
    },
    range: (min, max) => min + (max - min) * next(),
    chance: (probability) => next() < probability,
    pick: (items) => items[Math.floor(next() * items.length)],
    get state() {
      return state
    },
  }
}
