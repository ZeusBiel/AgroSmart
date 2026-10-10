// Catálogo de regras da automação. Cada regra decide a partir das análises
// (tendência, previsão, risco, qualidade dos dados), não apenas de leituras
// brutas. A ordem do array é a prioridade: regras de proteção vêm antes das
// regras que abrem válvulas, e um bloqueio impede regras posteriores de irrigar.

import { THERMAL_WINDOW, type FarmAnalysis, type PlotAnalysis } from '../analytics/analysis'
import { hoursToMs } from '../lib/time'
import { crops, plots } from '../domain/farm'
import type { CropProfile, Plot, Severity, ValveState } from '../domain/types'
import { formatHours, formatNumber, formatSigned } from '../lib/format'

export type RuleCategory = 'protecao' | 'irrigacao' | 'alerta'

export interface PlotRuleContext {
  analysis: FarmAnalysis
  plot: Plot
  crop: CropProfile
  result: PlotAnalysis
  valve: ValveState
  timestamp: number
}

export interface FarmRuleContext {
  analysis: FarmAnalysis
  timestamp: number
}

export interface AlertDecision {
  kind: 'alert'
  severity: Severity
  message: string
  detail: string
  cooldownHours: number
}

export type ValveDecision =
  /** Fecha a válvula (se aberta) e bloqueia regras de menor prioridade */
  | { kind: 'close'; reason: string }
  /** Bloqueia a abertura sem alterar a válvula (adiamento) */
  | { kind: 'hold'; reason: string }
  | { kind: 'open'; reason: string; target: number }

export type RuleDecision = AlertDecision | ValveDecision

interface RuleBase {
  id: string
  name: string
  category: RuleCategory
  condition: string
  action: string
}

export interface PlotRule extends RuleBase {
  scope: 'plot'
  evaluate: (ctx: PlotRuleContext) => RuleDecision[]
}

export interface FarmRule extends RuleBase {
  scope: 'farm'
  evaluate: (ctx: FarmRuleContext) => AlertDecision[]
}

export type AutomationRule = PlotRule | FarmRule

/** Tempo máximo de uma irrigação contínua antes do desligamento de segurança */
export const MAX_IRRIGATION_HOURS = 3
/** Antecedência com que a irrigação preditiva é acionada */
export const PREDICTIVE_LEAD_HOURS = 2

const pp = (value: number) => `${formatNumber(value)}%`

export const automationRules: AutomationRule[] = [
  {
    id: 'R01',
    scope: 'plot',
    name: 'Modo seguro por falha de sensor',
    category: 'protecao',
    condition: 'Sensor de umidade do talhão com 3 ou mais leituras inválidas seguidas',
    action: 'Fecha a válvula e notifica a manutenção',
    evaluate: ({ result }) =>
      result.moistureSensorFailing
        ? [
            { kind: 'close', reason: 'Sensor de umidade sem leituras confiáveis: irrigação em modo seguro.' },
            {
              kind: 'alert',
              severity: 'critical',
              message: 'Manutenção necessária no sensor de umidade',
              detail: 'Decisões de irrigação suspensas até o sensor voltar a enviar dados válidos.',
              cooldownHours: 2,
            },
          ]
        : [],
  },
  {
    id: 'R02',
    scope: 'plot',
    name: 'Suspensão por chuva',
    category: 'protecao',
    condition: 'Pluviômetro registra 0,4 mm ou mais nos últimos 30 min',
    action: 'Fecha válvulas abertas e impede novas irrigações',
    evaluate: ({ analysis }) =>
      analysis.weather.rainingNow
        ? [
            {
              kind: 'close',
              reason: `Chuva em andamento (${formatNumber(analysis.weather.rainLastHour)} mm na última hora).`,
            },
          ]
        : [],
  },
  {
    id: 'R03',
    scope: 'plot',
    name: 'Proteção contra excesso hídrico',
    category: 'protecao',
    condition: 'Umidade do solo acima do máximo da cultura',
    action: 'Fecha a válvula e alerta risco de encharcamento',
    evaluate: ({ result, crop }) =>
      result.moistureStatus === 'wet'
        ? [
            { kind: 'close', reason: `Umidade ${pp(result.moisture)} acima do máximo (${crop.moisture.max}%).` },
            {
              kind: 'alert',
              severity: 'warning',
              message: 'Excesso hídrico no solo',
              detail: `Umidade ${pp(result.moisture)} acima do máximo de ${crop.moisture.max}% para ${crop.name.toLowerCase()}.`,
              cooldownHours: 6,
            },
          ]
        : [],
  },
  {
    id: 'R04',
    scope: 'plot',
    name: 'Encerramento na meta de umidade',
    category: 'irrigacao',
    condition: `Válvula aberta e umidade ≥ meta da irrigação (meta da cultura ou lâmina calculada), ou irrigação contínua por ${MAX_IRRIGATION_HOURS} h`,
    action: 'Fecha a válvula',
    evaluate: ({ result, crop, valve, timestamp }) => {
      if (!valve.open) return []
      const target = valve.targetMoisture ?? crop.moisture.target
      if (result.moisture >= target) {
        return [{ kind: 'close', reason: `Meta atingida: ${pp(result.moisture)} (meta ${formatNumber(target)}%).` }]
      }
      const openHours = valve.openedAt === null ? 0 : (timestamp - valve.openedAt) / 3_600_000
      return openHours >= MAX_IRRIGATION_HOURS
        ? [{ kind: 'close', reason: `Tempo máximo de irrigação contínua (${MAX_IRRIGATION_HOURS} h) atingido.` }]
        : []
    },
  },
  {
    id: 'R05',
    scope: 'plot',
    name: 'Janela de menor evaporação',
    category: 'irrigacao',
    condition: `Irrigação necessária entre ${THERMAL_WINDOW.start}h e ${THERMAL_WINDOW.end}h sem umidade crítica (≥ mínimo − 2 p.p.)`,
    action: `Adia a irrigação para depois das ${THERMAL_WINDOW.end}h`,
    evaluate: ({ analysis, result, crop, valve }) => {
      const inWindow = analysis.hour >= THERMAL_WINDOW.start && analysis.hour < THERMAL_WINDOW.end
      if (!inWindow || valve.open || !planIrrigation(result, crop, analysis)) return []
      if (result.moisture < crop.moisture.min - 2) return []
      return [
        {
          kind: 'hold',
          reason: `Evaporação alta (${formatNumber(analysis.weather.current.airTemperature)} °C, ${formatNumber(analysis.weather.current.solarRadiation, 0)} W/m²): irrigação adiada para ${THERMAL_WINDOW.end}h.`,
        },
      ]
    },
  },
  {
    id: 'R06',
    scope: 'plot',
    name: 'Irrigação preditiva',
    category: 'irrigacao',
    condition: `Umidade abaixo do mínimo; previsão de atingi-lo em até ${PREDICTIVE_LEAD_HOURS} h; ou previsão de atingi-lo entre ${THERMAL_WINDOW.start}h e ${THERMAL_WINDOW.end}h (irrigação antecipada com lâmina calculada)`,
    action: 'Abre a válvula até a meta da cultura ou até a umidade que atravessa o pico de evaporação',
    evaluate: ({ analysis, result, crop, valve }) => {
      if (valve.open) return []
      const plan = planIrrigation(result, crop, analysis)
      if (!plan) return []
      const method =
        result.forecastMethod === 'water-balance'
          ? 'balanço hídrico'
          : `tendência ${formatSigned(result.moistureTrend, 2)} p.p./h`
      const forecast = `mínimo previsto em ~${formatHours(result.hoursToMin ?? 0)} (${method})`
      const reason =
        plan.kind === 'below-min'
          ? `Umidade ${pp(result.moisture)} abaixo do mínimo (${crop.moisture.min}%). Meta ${formatNumber(plan.target)}%.`
          : plan.kind === 'forecast'
            ? `Umidade ${pp(result.moisture)}: ${forecast}. Meta ${formatNumber(plan.target)}%.`
            : `Umidade ${pp(result.moisture)}: ${forecast}, dentro do pico de evaporação. Irrigação antecipada até ${formatNumber(plan.target)}% para atravessar a janela.`
      return [{ kind: 'open', reason, target: plan.target }]
    },
  },
  {
    id: 'R07',
    scope: 'plot',
    name: 'Alerta de estresse térmico',
    category: 'alerta',
    condition: 'Temperatura do ar acima do limite de conforto da cultura',
    action: 'Notifica o agrônomo com recomendação de manejo',
    evaluate: ({ analysis, crop }) => {
      const temperature = analysis.weather.current.airTemperature
      return temperature > crop.airTemperature.max
        ? [
            {
              kind: 'alert',
              severity: 'warning',
              message: 'Estresse térmico na cultura',
              detail: `Ar a ${formatNumber(temperature)} °C, acima de ${crop.airTemperature.max} °C para ${crop.name.toLowerCase()}. Manter umidade próxima da meta.`,
              cooldownHours: 6,
            },
          ]
        : []
    },
  },
  {
    id: 'R08',
    scope: 'plot',
    name: 'Recomendação de correção de pH',
    category: 'alerta',
    condition: 'pH do solo fora da faixa ideal da cultura',
    action: 'Recomenda calagem ou acidificação',
    evaluate: ({ result, crop }) =>
      result.phStatus === 'ok'
        ? []
        : [
            {
              kind: 'alert',
              severity: 'info',
              message: result.phStatus === 'low' ? 'Recomendação de calagem' : 'Recomendação de acidificação do solo',
              detail: `pH ${formatNumber(result.soilPH, 2)} fora da faixa ${formatNumber(crop.ph.min)}–${formatNumber(crop.ph.max)}.`,
              cooldownHours: 24,
            },
          ],
  },
  {
    id: 'R09',
    scope: 'farm',
    name: 'Alerta de risco fúngico',
    category: 'alerta',
    condition: '6 h ou mais com umidade do ar ≥ 85% e 18–28 °C nas últimas 24 h',
    action: 'Recomenda inspeção e fungicida preventivo',
    evaluate: ({ analysis }) =>
      analysis.weather.fungalRisk === 'high'
        ? [
            {
              kind: 'alert',
              severity: 'warning',
              message: 'Risco alto de doenças fúngicas',
              detail: `${formatHours(analysis.weather.fungalRiskHours)} de condição favorável. Inspecionar ${plots
                .map((plot) => crops[plot.cropId].fungalDisease)
                .join(', ')}.`,
              cooldownHours: 6,
            },
          ]
        : [],
  },
]

/** Horas antes da janela térmica em que a irrigação pode ser antecipada */
const ANTICIPATION_HOURS = 3
/** Lâmina mínima (p.p. de umidade) para justificar ligar o sistema */
const MIN_IRRIGATION_GAIN = 2
/** Folga acima do mínimo que a irrigação antecipada deve garantir no fim da janela */
const ANTICIPATION_MARGIN = 2

export interface IrrigationPlan {
  kind: 'below-min' | 'forecast' | 'anticipation'
  target: number
}

/** Decide se o talhão precisa irrigar e até qual umidade. */
export function planIrrigation(
  result: PlotAnalysis,
  crop: CropProfile,
  analysis: Pick<FarmAnalysis, 'hour' | 'timestamp'>,
): IrrigationPlan | null {
  const { min, target, max } = crop.moisture
  if (result.moisture < min) return { kind: 'below-min', target }
  if (result.hoursToMin === null || result.moisture >= target) return null
  if (result.hoursToMin <= PREDICTIVE_LEAD_HOURS) return { kind: 'forecast', target }

  // Se o mínimo cair dentro do pico de evaporação, irriga antes dele com a
  // lâmina necessária para chegar ao fim da janela com folga.
  const { hour } = analysis
  const beforeWindow = hour >= THERMAL_WINDOW.start - ANTICIPATION_HOURS && hour < THERMAL_WINDOW.start
  if (!beforeWindow || hour + result.hoursToMin >= THERMAL_WINDOW.end) return null

  const windowEnd = analysis.timestamp + hoursToMs(THERMAL_WINDOW.end - hour)
  const projected = result.forecast.find((point) => point.t >= windowEnd)
  const expectedDrop = projected
    ? result.moisture - projected.v
    : -result.moistureTrend * (THERMAL_WINDOW.end - hour)
  const needed = Math.min(max - 1, Math.max(target, min + expectedDrop + ANTICIPATION_MARGIN))
  return needed - result.moisture >= MIN_IRRIGATION_GAIN ? { kind: 'anticipation', target: needed } : null
}
