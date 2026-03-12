import { createContext } from '@barefootjs/dom'
import type { BarChartContextValue, RadarChartContextValue, ChartConfig } from './types'

export const BarChartContext = createContext<BarChartContextValue>()

export const RadarChartContext = createContext<RadarChartContextValue>()

export const ChartConfigContext = createContext<{ config: ChartConfig }>()
