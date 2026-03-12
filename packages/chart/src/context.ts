import { createContext } from '@barefootjs/dom'
import type { BarChartContextValue, AreaChartContextValue, ChartConfig } from './types'

export const BarChartContext = createContext<BarChartContextValue>()

export const AreaChartContext = createContext<AreaChartContextValue>()

export const ChartConfigContext = createContext<{ config: ChartConfig }>()
