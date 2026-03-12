import { createContext } from '@barefootjs/dom'
import type { BarChartContextValue, RadialChartContextValue, ChartConfig } from './types'

export const BarChartContext = createContext<BarChartContextValue>()

export const RadialChartContext = createContext<RadialChartContextValue>()

export const ChartConfigContext = createContext<{ config: ChartConfig }>()
