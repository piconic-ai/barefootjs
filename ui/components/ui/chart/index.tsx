"use client"

/**
 * Chart JSX Components
 *
 * Containers (ChartContainer, BarChart, AreaChart, LineChart, RadialChart,
 * RadarChart, PieChart) are JSX-native: they own the `<svg viewBox>` and
 * inner `<g transform>` directly and provide the chart context via
 * `<XContext.Provider>` so child primitives can read it.
 *
 * Primitives (Bar, XAxis, YAxis, ...) still delegate to imperative
 * `init*` callbacks until Step 2 of the Phase 9 chart migration (#1080).
 */

import { createSignal, createMemo, createEffect, useContext } from '@barefootjs/client'
import {
  applyChartCSSVariables,
  BarChartContext,
  AreaChartContext,
  RadialChartContext,
  RadarChartContext,
  PieChartContext,
  ChartConfigContext,
  createBandScale,
  createLinearScale,
  createPointScale,
  createRadarRadialScale,
  initBar as barInit,
  initArea as areaInit,
  initCartesianGrid as cartesianGridInit,
  initXAxis as xAxisInit,
  initYAxis as yAxisInit,
  initChartTooltip as chartTooltipInit,
  initRadialBar as radialBarInit,
  initRadialChartLabel as radialChartLabelInit,
  initRadar as radarInit,
  initPolarGrid as polarGridInit,
  initPolarAngleAxis as polarAngleAxisInit,
  initRadarTooltip as radarTooltipInit,
  initPie as pieInit,
  initPieTooltip as pieTooltipInit,
  initAreaXAxis as areaXAxisInit,
  initAreaYAxis as areaYAxisInit,
  initAreaCartesianGrid as areaCartesianGridInit,
  initAreaChartTooltip as areaChartTooltipInit,
  initLine as lineInit,
} from '@barefootjs/chart'
import type {
  BarRegistration,
  AreaRegistration,
  RadialBarRegistration,
  RadarRegistration,
  PieRegistration,
} from '@barefootjs/chart'

const CHART_BAR_MARGIN = { top: 10, right: 12, bottom: 30, left: 40 }
const CHART_BAR_ASPECT = 0.5
const CHART_AREA_MARGIN = CHART_BAR_MARGIN
const CHART_AREA_ASPECT = 0.5
const CHART_LINE_MARGIN = CHART_BAR_MARGIN
const CHART_LINE_ASPECT = 0.5
const CHART_RADIAL_MARGIN = 10
const CHART_RADAR_MARGIN = { top: 40, right: 40, bottom: 40, left: 40 }
const CHART_RADAR_ASPECT = 1
const CHART_PIE_ASPECT = 1

/** Color and label configuration for chart data series */
type ChartConfig = Record<string, { label: string; color: string }>

interface ChartContainerProps {
  config: ChartConfig
  className?: string
  children?: unknown
}

interface BarChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface BarProps {
  dataKey: string
  fill?: string
  radius?: number
}

interface CartesianGridProps {
  vertical?: boolean
  horizontal?: boolean
}

interface XAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

interface YAxisProps {
  hide?: boolean
  tickFormatter?: (value: number) => string
}

interface AreaChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface LineChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface AreaProps {
  dataKey: string
  fill?: string
  stroke?: string
  fillOpacity?: number
}

interface AreaCartesianGridProps {
  vertical?: boolean
  horizontal?: boolean
}

interface AreaXAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

interface AreaYAxisProps {
  hide?: boolean
  tickFormatter?: (value: number) => string
}

interface AreaChartTooltipProps {
  labelFormatter?: (label: string) => string
}

interface LineProps {
  dataKey: string
  stroke?: string
  strokeWidth?: number
  type?: 'linear' | 'monotone'
  dot?: boolean
}

interface ChartTooltipProps {
  labelFormatter?: (label: string) => string
}

interface RadialChartProps {
  data: Record<string, unknown>[]
  innerRadius?: number
  outerRadius?: number
  startAngle?: number
  endAngle?: number
  children?: unknown
}

interface RadialBarProps {
  dataKey: string
  fill?: string
  stackId?: string
}

interface RadialChartLabelProps {
  children?: unknown
}

interface RadarChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface PieChartProps {
  data: Record<string, unknown>[]
  children?: unknown
}

interface RadarProps {
  dataKey: string
  fill?: string
  fillOpacity?: number
}

interface PolarGridProps {
  gridType?: 'polygon' | 'circle'
  show?: boolean
}

interface PolarAngleAxisProps {
  dataKey: string
  tickFormatter?: (value: string) => string
  hide?: boolean
}

interface RadarTooltipProps {
  labelFormatter?: (label: string) => string
}

interface PieProps {
  dataKey: string
  nameKey?: string
  fill?: string
  innerRadius?: number
  outerRadius?: number
  paddingAngle?: number
}

interface PieTooltipProps {
  labelFormatter?: (label: string) => string
}

function ChartContainer(props: ChartContainerProps) {
  const handleMount = (el: HTMLElement) => {
    applyChartCSSVariables(el, props.config ?? {})
    el.style.color = 'hsl(var(--foreground))'
  }

  return (
    <ChartConfigContext.Provider value={{ config: props.config ?? {} }}>
      <div data-slot="chart-container" className={props.className ?? ''} ref={handleMount}>
        {props.children}
      </div>
    </ChartConfigContext.Provider>
  )
}

function BarChart(props: BarChartProps) {
  // Destructured `const { config } = useContext(...)` is silently dropped by
  // the analyzer (it skips non-identifier VariableDeclaration names), so we
  // bind the whole context object and read `.config` lazily.
  const chartCtx = useContext(ChartConfigContext)

  const [width, setWidth] = createSignal(500)
  const [bars, setBars] = createSignal<BarRegistration[]>([])
  const [xDataKey, setXDataKey] = createSignal('')
  const [svgGroupEl, setSvgGroupEl] = createSignal<SVGGElement | null>(null)
  const [containerEl, setContainerEl] = createSignal<HTMLElement | null>(null)
  const [xScaleSig, setXScale] = createSignal<ReturnType<typeof createBandScale> | null>(null)
  const [yScaleSig, setYScale] = createSignal<ReturnType<typeof createLinearScale> | null>(null)

  const height = createMemo(() => Math.round(width() * CHART_BAR_ASPECT))
  const innerWidth = createMemo(() => width() - CHART_BAR_MARGIN.left - CHART_BAR_MARGIN.right)
  const innerHeight = createMemo(() => height() - CHART_BAR_MARGIN.top - CHART_BAR_MARGIN.bottom)

  const registerBar = (bar: BarRegistration) => {
    setBars((prev) => [...prev, bar])
  }
  const unregisterBar = (dataKey: string) => {
    setBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  const handleContainer = (el: HTMLElement) => {
    setContainerEl(el)
    const rect = el.getBoundingClientRect()
    setWidth(rect.width || 500)
    el.style.height = `${Math.round((rect.width || 500) * CHART_BAR_ASPECT)}px`
    el.style.minHeight = ''
  }

  const handleSvgGroup = (el: SVGGElement) => {
    setSvgGroupEl(el)
  }

  // Recompute scales whenever data, registered bars, or xDataKey change.
  // Wrap in arrow functions: D3 scales are functions, and signal setters
  // interpret function args as updater functions.
  createEffect(() => {
    const currentBars = bars()
    const key = xDataKey()
    const data = props.data ?? []
    const iw = innerWidth()
    const ih = innerHeight()
    if (!key || currentBars.length === 0) return
    setXScale(() => createBandScale(data, key, iw))
    setYScale(() => createLinearScale(data, currentBars.map((b) => b.dataKey), ih))
  })

  return (
    <BarChartContext.Provider value={{
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      xDataKey,
      xScale: xScaleSig,
      yScale: yScaleSig,
      innerWidth,
      innerHeight,
      config: () => chartCtx.config,
      bars,
      registerBar,
      unregisterBar,
      setXDataKey,
    }}>
      <div data-slot="bar-chart" ref={handleContainer}>
        <svg
          viewBox={`0 0 ${width()} ${height()}`}
          style={`width:100%;height:${height()}px;display:block`}
        >
          <g
            transform={`translate(${CHART_BAR_MARGIN.left},${CHART_BAR_MARGIN.top})`}
            ref={handleSvgGroup}
          >
            {props.children}
          </g>
        </svg>
      </div>
    </BarChartContext.Provider>
  )
}

function Bar(props: BarProps) {
  const handleMount = (el: HTMLElement) => {
    barInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="bar" style="display:none" ref={handleMount} />
}

function CartesianGrid(props: CartesianGridProps) {
  const handleMount = (el: HTMLElement) => {
    cartesianGridInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="cartesian-grid" style="display:none" ref={handleMount} />
}

function XAxis(props: XAxisProps) {
  const handleMount = (el: HTMLElement) => {
    xAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="x-axis" style="display:none" ref={handleMount} />
}

function YAxis(props: YAxisProps) {
  const handleMount = (el: HTMLElement) => {
    yAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="y-axis" style="display:none" ref={handleMount} />
}

function ChartTooltip(props: ChartTooltipProps) {
  const handleMount = (el: HTMLElement) => {
    chartTooltipInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="chart-tooltip" style="display:none" ref={handleMount} />
}

function RadialChart(props: RadialChartProps) {
  // Destructured `const { config } = useContext(...)` is silently dropped by
  // the analyzer (it skips non-identifier VariableDeclaration names), so we
  // bind the whole context object and read `.config` lazily.
  const chartCtx = useContext(ChartConfigContext)

  const [width, setWidth] = createSignal(300)
  const [radialBars, setRadialBars] = createSignal<RadialBarRegistration[]>([])
  const [svgGroupEl, setSvgGroupEl] = createSignal<SVGGElement | null>(null)
  const [containerEl, setContainerEl] = createSignal<HTMLElement | null>(null)

  // Square layout: height matches width.
  const height = createMemo(() => width())
  const cx = createMemo(() => width() / 2)
  const cy = createMemo(() => height() / 2)
  const innerW = createMemo(() => width() - CHART_RADIAL_MARGIN * 2)
  const innerH = createMemo(() => height() - CHART_RADIAL_MARGIN * 2)
  const maxRadius = createMemo(() => Math.min(innerW(), innerH()) / 2)

  const registerRadialBar = (bar: RadialBarRegistration) => {
    setRadialBars((prev) => [...prev, bar])
  }
  const unregisterRadialBar = (dataKey: string) => {
    setRadialBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  const handleContainer = (el: HTMLElement) => {
    setContainerEl(el)
    const rect = el.getBoundingClientRect()
    const w = rect.width || 300
    setWidth(w)
    el.style.height = `${w}px`
    el.style.minHeight = ''
  }

  const handleSvgGroup = (el: SVGGElement) => {
    setSvgGroupEl(el)
  }

  return (
    <RadialChartContext.Provider value={{
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      innerRadius: () => {
        const v = props.innerRadius
        return v != null ? v : maxRadius() * 0.4
      },
      outerRadius: () => {
        const v = props.outerRadius
        return v != null ? v : maxRadius()
      },
      startAngle: () => props.startAngle ?? 0,
      endAngle: () => props.endAngle ?? 360,
      config: () => chartCtx.config,
      centerX: cx,
      centerY: cy,
      radialBars,
      registerRadialBar,
      unregisterRadialBar,
    }}>
      <div data-slot="radial-chart" ref={handleContainer}>
        <svg
          viewBox={`0 0 ${width()} ${height()}`}
          style={`width:100%;height:${height()}px;display:block`}
        >
          <g transform={`translate(${cx()},${cy()})`} ref={handleSvgGroup}>
            {props.children}
          </g>
        </svg>
      </div>
    </RadialChartContext.Provider>
  )
}

function RadialBar(props: RadialBarProps) {
  const handleMount = (el: HTMLElement) => {
    radialBarInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="radial-bar" style="display:none" ref={handleMount} />
}

function RadialChartLabel(props: RadialChartLabelProps) {
  const handleMount = (el: HTMLElement) => {
    radialChartLabelInit(el, props as unknown as Record<string, unknown>)
  }

  return (
    <span data-slot="radial-chart-label" ref={handleMount}>
      {props.children}
    </span>
  )
}

function RadarChart(props: RadarChartProps) {
  // Destructured `const { config } = useContext(...)` is silently dropped by
  // the analyzer (it skips non-identifier VariableDeclaration names), so we
  // bind the whole context object and read `.config` lazily.
  const chartCtx = useContext(ChartConfigContext)

  const [width, setWidth] = createSignal(500)
  const [radars, setRadars] = createSignal<RadarRegistration[]>([])
  const [dataKey, setDataKey] = createSignal('')
  const [svgGroupEl, setSvgGroupEl] = createSignal<SVGGElement | null>(null)
  const [containerEl, setContainerEl] = createSignal<HTMLElement | null>(null)
  const [radialScaleSig, setRadialScale] = createSignal<ReturnType<typeof createRadarRadialScale>>(null)

  const height = createMemo(() => Math.round(width() * CHART_RADAR_ASPECT))
  const innerW = createMemo(() => width() - CHART_RADAR_MARGIN.left - CHART_RADAR_MARGIN.right)
  const innerH = createMemo(() => height() - CHART_RADAR_MARGIN.top - CHART_RADAR_MARGIN.bottom)
  const radius = createMemo(() => Math.min(innerW(), innerH()) / 2)
  const cx = createMemo(() => CHART_RADAR_MARGIN.left + innerW() / 2)
  const cy = createMemo(() => CHART_RADAR_MARGIN.top + innerH() / 2)

  const registerRadar = (radar: RadarRegistration) => {
    setRadars((prev) => [...prev, radar])
  }
  const unregisterRadar = (dk: string) => {
    setRadars((prev) => prev.filter((r) => r.dataKey !== dk))
  }

  const handleContainer = (el: HTMLElement) => {
    setContainerEl(el)
    const rect = el.getBoundingClientRect()
    const w = rect.width || 500
    setWidth(w)
    el.style.height = `${Math.round(w * CHART_RADAR_ASPECT)}px`
    el.style.minHeight = ''
  }

  const handleSvgGroup = (el: SVGGElement) => {
    setSvgGroupEl(el)
  }

  // Recompute radial scale when registered radars or data change.
  createEffect(() => {
    const currentRadars = radars()
    const data = props.data ?? []
    const r = radius()
    if (currentRadars.length === 0) return
    setRadialScale(() => createRadarRadialScale(data, currentRadars.map((rd) => rd.dataKey), r))
  })

  return (
    <RadarChartContext.Provider value={{
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      dataKey,
      radius,
      radialScale: radialScaleSig,
      config: () => chartCtx.config,
      radars,
      registerRadar,
      unregisterRadar,
      setDataKey,
    }}>
      <div data-slot="radar-chart" ref={handleContainer}>
        <svg
          viewBox={`0 0 ${width()} ${height()}`}
          style={`width:100%;height:${height()}px;display:block`}
        >
          <g transform={`translate(${cx()},${cy()})`} ref={handleSvgGroup}>
            {props.children}
          </g>
        </svg>
      </div>
    </RadarChartContext.Provider>
  )
}

function Radar(props: RadarProps) {
  const handleMount = (el: HTMLElement) => {
    radarInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="radar" style="display:none" ref={handleMount} />
}

function PolarGrid(props: PolarGridProps) {
  const handleMount = (el: HTMLElement) => {
    polarGridInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="polar-grid" style="display:none" ref={handleMount} />
}

function PolarAngleAxis(props: PolarAngleAxisProps) {
  const handleMount = (el: HTMLElement) => {
    polarAngleAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="polar-angle-axis" style="display:none" ref={handleMount} />
}

function RadarTooltip(props: RadarTooltipProps) {
  const handleMount = (el: HTMLElement) => {
    radarTooltipInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="radar-tooltip" style="display:none" ref={handleMount} />
}

function PieChart(props: PieChartProps) {
  // Destructured `const { config } = useContext(...)` is silently dropped by
  // the analyzer (it skips non-identifier VariableDeclaration names), so we
  // bind the whole context object and read `.config` lazily.
  const chartCtx = useContext(ChartConfigContext)

  const [width, setWidth] = createSignal(500)
  const [pies, setPies] = createSignal<PieRegistration[]>([])
  const [svgGroupEl, setSvgGroupEl] = createSignal<SVGGElement | null>(null)
  const [containerEl, setContainerEl] = createSignal<HTMLElement | null>(null)

  const height = createMemo(() => Math.round(width() * CHART_PIE_ASPECT))

  const registerPie = (pie: PieRegistration) => {
    setPies((prev) => [...prev, pie])
  }
  const unregisterPie = (dataKey: string) => {
    setPies((prev) => prev.filter((p) => p.dataKey !== dataKey))
  }

  const handleContainer = (el: HTMLElement) => {
    setContainerEl(el)
    const rect = el.getBoundingClientRect()
    const w = rect.width || 500
    setWidth(w)
    el.style.height = `${Math.round(w * CHART_PIE_ASPECT)}px`
    el.style.minHeight = ''
  }

  const handleSvgGroup = (el: SVGGElement) => {
    setSvgGroupEl(el)
  }

  return (
    <PieChartContext.Provider value={{
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      width,
      height,
      config: () => chartCtx.config,
      pies,
      registerPie,
      unregisterPie,
    }}>
      <div data-slot="pie-chart" ref={handleContainer}>
        <svg
          viewBox={`0 0 ${width()} ${height()}`}
          style={`width:100%;height:${height()}px;display:block`}
        >
          <g transform={`translate(${width() / 2},${height() / 2})`} ref={handleSvgGroup}>
            {props.children}
          </g>
        </svg>
      </div>
    </PieChartContext.Provider>
  )
}

function Pie(props: PieProps) {
  const handleMount = (el: HTMLElement) => {
    pieInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="pie" style="display:none" ref={handleMount} />
}

function PieTooltip(props: PieTooltipProps) {
  const handleMount = (el: HTMLElement) => {
    pieTooltipInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="pie-tooltip" style="display:none" ref={handleMount} />
}

function AreaChart(props: AreaChartProps) {
  // Destructured `const { config } = useContext(...)` is silently dropped by
  // the analyzer (it skips non-identifier VariableDeclaration names), so we
  // bind the whole context object and read `.config` lazily.
  const chartCtx = useContext(ChartConfigContext)

  const [width, setWidth] = createSignal(500)
  const [areas, setAreas] = createSignal<AreaRegistration[]>([])
  const [xDataKey, setXDataKey] = createSignal('')
  const [svgGroupEl, setSvgGroupEl] = createSignal<SVGGElement | null>(null)
  const [containerEl, setContainerEl] = createSignal<HTMLElement | null>(null)
  const [xScaleSig, setXScale] = createSignal<ReturnType<typeof createPointScale> | null>(null)
  const [yScaleSig, setYScale] = createSignal<ReturnType<typeof createLinearScale> | null>(null)

  const height = createMemo(() => Math.round(width() * CHART_AREA_ASPECT))
  const innerWidth = createMemo(() => width() - CHART_AREA_MARGIN.left - CHART_AREA_MARGIN.right)
  const innerHeight = createMemo(() => height() - CHART_AREA_MARGIN.top - CHART_AREA_MARGIN.bottom)

  const registerArea = (area: AreaRegistration) => {
    setAreas((prev) => [...prev, area])
  }
  const unregisterArea = (dataKey: string) => {
    setAreas((prev) => prev.filter((a) => a.dataKey !== dataKey))
  }

  const handleContainer = (el: HTMLElement) => {
    setContainerEl(el)
    const rect = el.getBoundingClientRect()
    const w = rect.width || 500
    setWidth(w)
    el.style.height = `${Math.round(w * CHART_AREA_ASPECT)}px`
    el.style.minHeight = ''
  }

  const handleSvgGroup = (el: SVGGElement) => {
    setSvgGroupEl(el)
  }

  createEffect(() => {
    const currentAreas = areas()
    const key = xDataKey()
    const data = props.data ?? []
    const iw = innerWidth()
    const ih = innerHeight()
    if (!key || currentAreas.length === 0) return
    setXScale(() => createPointScale(data, key, iw))
    setYScale(() => createLinearScale(data, currentAreas.map((a) => a.dataKey), ih))
  })

  return (
    <AreaChartContext.Provider value={{
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      xDataKey,
      xScale: xScaleSig,
      yScale: yScaleSig,
      innerWidth,
      innerHeight,
      config: () => chartCtx.config,
      areas,
      registerArea,
      unregisterArea,
      setXDataKey,
    }}>
      <div data-slot="area-chart" ref={handleContainer}>
        <svg
          viewBox={`0 0 ${width()} ${height()}`}
          style={`width:100%;height:${height()}px;display:block`}
        >
          <g
            transform={`translate(${CHART_AREA_MARGIN.left},${CHART_AREA_MARGIN.top})`}
            ref={handleSvgGroup}
          >
            {props.children}
          </g>
        </svg>
      </div>
    </AreaChartContext.Provider>
  )
}

function Area(props: AreaProps) {
  const handleMount = (el: HTMLElement) => {
    areaInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area" style="display:none" ref={handleMount} />
}

function AreaCartesianGrid(props: AreaCartesianGridProps) {
  const handleMount = (el: HTMLElement) => {
    areaCartesianGridInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-cartesian-grid" style="display:none" ref={handleMount} />
}

function AreaXAxis(props: AreaXAxisProps) {
  const handleMount = (el: HTMLElement) => {
    areaXAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-x-axis" style="display:none" ref={handleMount} />
}

function AreaYAxis(props: AreaYAxisProps) {
  const handleMount = (el: HTMLElement) => {
    areaYAxisInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-y-axis" style="display:none" ref={handleMount} />
}

function AreaChartTooltip(props: AreaChartTooltipProps) {
  const handleMount = (el: HTMLElement) => {
    areaChartTooltipInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="area-chart-tooltip" style="display:none" ref={handleMount} />
}

function LineChart(props: LineChartProps) {
  // LineChart provides BarChartContext so shared primitives (XAxis, YAxis,
  // CartesianGrid, ChartTooltip, Line) work without modification.
  // Destructured `const { config } = useContext(...)` is silently dropped by
  // the analyzer (it skips non-identifier VariableDeclaration names), so we
  // bind the whole context object and read `.config` lazily.
  const chartCtx = useContext(ChartConfigContext)

  const [width, setWidth] = createSignal(500)
  const [bars, setBars] = createSignal<BarRegistration[]>([])
  const [xDataKey, setXDataKey] = createSignal('')
  const [svgGroupEl, setSvgGroupEl] = createSignal<SVGGElement | null>(null)
  const [containerEl, setContainerEl] = createSignal<HTMLElement | null>(null)
  const [xScaleSig, setXScale] = createSignal<ReturnType<typeof createBandScale> | null>(null)
  const [yScaleSig, setYScale] = createSignal<ReturnType<typeof createLinearScale> | null>(null)

  const height = createMemo(() => Math.round(width() * CHART_LINE_ASPECT))
  const innerWidth = createMemo(() => width() - CHART_LINE_MARGIN.left - CHART_LINE_MARGIN.right)
  const innerHeight = createMemo(() => height() - CHART_LINE_MARGIN.top - CHART_LINE_MARGIN.bottom)

  const registerBar = (bar: BarRegistration) => {
    setBars((prev) => [...prev, bar])
  }
  const unregisterBar = (dataKey: string) => {
    setBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  const handleContainer = (el: HTMLElement) => {
    setContainerEl(el)
    const rect = el.getBoundingClientRect()
    const w = rect.width || 500
    setWidth(w)
    el.style.height = `${Math.round(w * CHART_LINE_ASPECT)}px`
    el.style.minHeight = ''
  }

  const handleSvgGroup = (el: SVGGElement) => {
    setSvgGroupEl(el)
  }

  createEffect(() => {
    const currentBars = bars()
    const key = xDataKey()
    const data = props.data ?? []
    const iw = innerWidth()
    const ih = innerHeight()
    if (!key || currentBars.length === 0) return
    setXScale(() => createBandScale(data, key, iw))
    setYScale(() => createLinearScale(data, currentBars.map((b) => b.dataKey), ih))
  })

  return (
    <BarChartContext.Provider value={{
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      xDataKey,
      xScale: xScaleSig,
      yScale: yScaleSig,
      innerWidth,
      innerHeight,
      config: () => chartCtx.config,
      bars,
      registerBar,
      unregisterBar,
      setXDataKey,
    }}>
      <div data-slot="line-chart" ref={handleContainer}>
        <svg
          viewBox={`0 0 ${width()} ${height()}`}
          style={`width:100%;height:${height()}px;display:block`}
        >
          <g
            transform={`translate(${CHART_LINE_MARGIN.left},${CHART_LINE_MARGIN.top})`}
            ref={handleSvgGroup}
          >
            {props.children}
          </g>
        </svg>
      </div>
    </BarChartContext.Provider>
  )
}

function Line(props: LineProps) {
  const handleMount = (el: HTMLElement) => {
    lineInit(el, props as unknown as Record<string, unknown>)
  }

  return <span data-slot="line" style="display:none" ref={handleMount} />
}


export {
  ChartContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  AreaCartesianGrid,
  XAxis,
  AreaXAxis,
  YAxis,
  AreaYAxis,
  ChartTooltip,
  RadialChart,
  RadialBar,
  RadialChartLabel,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  RadarTooltip,
  PieChart,
  Pie,
  PieTooltip,
  AreaChartTooltip,
}

export type {
  ChartContainerProps,
  BarChartProps,
  BarProps,
  AreaChartProps,
  AreaProps,
  AreaCartesianGridProps,
  AreaXAxisProps,
  AreaYAxisProps,
  AreaChartTooltipProps,
  LineChartProps,
  LineProps,
  CartesianGridProps,
  XAxisProps,
  YAxisProps,
  ChartTooltipProps,
  RadialChartProps,
  RadialBarProps,
  RadialChartLabelProps,
  RadarChartProps,
  RadarProps,
  PolarGridProps,
  PolarAngleAxisProps,
  RadarTooltipProps,
  PieChartProps,
  PieProps,
  PieTooltipProps,
}
