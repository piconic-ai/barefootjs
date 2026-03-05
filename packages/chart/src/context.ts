import { createContext } from '@barefootjs/dom'
import type { BarChartContextValue, ChartConfig } from './types'

export const BarChartContext = createContext<BarChartContextValue>()

export const ChartConfigContext = createContext<{ config: ChartConfig }>()
