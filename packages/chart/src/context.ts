import { createContext } from '@barefootjs/client/runtime'
import type { BarChartContextValue, RadialChartContextValue, RadarChartContextValue, PieChartContextValue, AreaChartContextValue, ChartConfig } from './types.ts'

export const BarChartContext = createContext<BarChartContextValue>()

export const RadialChartContext = createContext<RadialChartContextValue>()

export const RadarChartContext = createContext<RadarChartContextValue>()

export const PieChartContext = createContext<PieChartContextValue>()

export const AreaChartContext = createContext<AreaChartContextValue>()

export const ChartConfigContext = createContext<{ config: ChartConfig }>()
