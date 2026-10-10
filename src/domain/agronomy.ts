import { TICKS_PER_HOUR } from './farm'

/**
 * Evapotranspiração de referência (ET0) acumulada em um ciclo de coleta, em mm.
 * Variante horária da equação de Hargreaves usando a radiação medida pela
 * estação: ET0 = 0,0135 · (T + 17,8) · Rs, com Rs convertida para mm/h.
 */
export function referenceEvapotranspiration(airTemperature: number, solarRadiation: number) {
  const radiationMJ = solarRadiation * 0.0036
  const et0Hour = (0.0135 * (airTemperature + 17.8) * radiationMJ) / 2.45 + 0.02
  return Math.max(0, et0Hour) / TICKS_PER_HOUR
}

/** 1 mm de lâmina sobre 1 ha corresponde a 10 m³ de água. */
export const mmToCubicMeters = (mm: number, areaHa: number) => mm * areaHa * 10
