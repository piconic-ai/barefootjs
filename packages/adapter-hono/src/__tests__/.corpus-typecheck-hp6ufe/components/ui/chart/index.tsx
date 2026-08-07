import { createSignal, createMemo, createEffect, onCleanup, useContext, provideContextSSR } from '@barefootjs/hono/client-shim'
import { applyChartCSSVariables, BarChartContext, AreaChartContext, RadialChartContext, RadarChartContext, PieChartContext, ChartConfigContext, createBandScale, createLinearScale, createPointScale, createRadarRadialScale, buildRadialBarArcs, buildPieSlices, CHART_CLASS_GRID, CHART_CLASS_X_AXIS, CHART_CLASS_Y_AXIS, CHART_CLASS_POLAR_GRID, CHART_CLASS_POLAR_ANGLE_AXIS, CHART_CLASS_RADIAL_BAR, CHART_CLASS_RADIAL_LABEL, CHART_CLASS_BAR, CHART_CLASS_LINE, CHART_CLASS_AREA, CHART_CLASS_AREA_DOT, CHART_CLASS_RADAR, CHART_CLASS_PIE, CHART_CLASS_TOOLTIP, buildLinePath, buildLinePoints, buildAreaPaths, buildAreaDots, buildRadarVertices, buildRadarPolygonPoints } from '@barefootjs/chart'
import type { BarRegistration, AreaRegistration, RadialBarRegistration, RadarRegistration, PieRegistration } from '@barefootjs/chart'
import { bfComment, bfText, bfTextEnd } from '@barefootjs/hono/utils'

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

interface TooltipRow {
  color: string
  label: string
  value: string
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  label: string
  rows: TooltipRow[]
}

type PolarGridShape =
  | { key: string; kind: 'circle'; r: number }
  | { key: string; kind: 'polygon'; points: string }
  | { key: string; kind: 'spoke'; x2: number; y2: number }

const CHART_TOOLTIP_BODY_STYLE = 'position:absolute;pointer-events:none;transition:opacity 150ms;' +
  'background-color:var(--popover);color:var(--popover-foreground);' +
  'border:1px solid var(--border);border-radius:6px;padding:8px 12px;' +
  'font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,0.15);z-index:50;white-space:nowrap'

const TOOLTIP_INITIAL = { visible: false, x: 0, y: 0, label: '', rows: [] }

export type { ChartContainerProps, BarChartProps, BarProps, AreaChartProps, AreaProps, AreaCartesianGridProps, AreaXAxisProps, AreaYAxisProps, AreaChartTooltipProps, LineChartProps, LineProps, CartesianGridProps, XAxisProps, YAxisProps, ChartTooltipProps, RadialChartProps, RadialBarProps, RadialChartLabelProps, RadarChartProps, RadarProps, PolarGridProps, PolarAngleAxisProps, RadarTooltipProps, PieChartProps, PieProps, PieTooltipProps }

export function ChartContainer(__allProps: ChartContainerProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ChartContainer_${Math.random().toString(36).slice(2, 8)}`

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.config !== 'function' && !(typeof props.config === 'object' && props.config !== null && 'isEscaped' in props.config)) __hydrateProps['config'] = props.config
  if (typeof props.className !== 'function' && !(typeof props.className === 'object' && props.className !== null && 'isEscaped' in props.className)) __hydrateProps['className'] = props.className
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(ChartConfigContext, { config: props.config ?? {} }, <><div data-slot="chart-container" className={props.className ?? ''} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0">{props.children}</div></>)}</>
  )
}

export function BarChart(__allProps: BarChartProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `BarChart_${Math.random().toString(36).slice(2, 8)}`
  const width = () => 500
  const bars = () => [] as BarRegistration[]
  const setBars = (..._args: any[]) => {}
  const xDataKey = () => ''
  const setXDataKey = (..._args: any[]) => {}
  const svgGroupEl = () => null as SVGGElement | null
  const containerEl = () => null as HTMLElement | null
  const xScaleSig = () => null as ReturnType<typeof createBandScale> | null
  const yScaleSig = () => null as ReturnType<typeof createLinearScale> | null
  const height = () => Math.round(width() * CHART_BAR_ASPECT)
  const innerWidth = () => width() - CHART_BAR_MARGIN.left - CHART_BAR_MARGIN.right
  const innerHeight = () => height() - CHART_BAR_MARGIN.top - CHART_BAR_MARGIN.bottom
  const chartCtx = useContext(ChartConfigContext)
  const registerBar = (bar: BarRegistration) => {
    setBars((prev) => [...prev, bar])
  }
  const unregisterBar = (dataKey: string) => {
    setBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.data !== 'function' && !(typeof props.data === 'object' && props.data !== null && 'isEscaped' in props.data)) __hydrateProps['data'] = props.data
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(BarChartContext, {
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
    }, <><div data-slot="bar-chart" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><svg viewBox={`0 0 ${width()} ${height()}`} style={`width:100%;height:${height()}px;display:block`} bf="s1"><g transform={`translate(${CHART_BAR_MARGIN.left},${CHART_BAR_MARGIN.top})`} bf="s0">{props.children}</g></svg></div></>)}</>
  )
}

export function Bar(__allProps: BarProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Bar_${Math.random().toString(36).slice(2, 8)}`
  const bars = () => {
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!xs || !ys) return []

    const allBars = ctx.bars()
    const dataKey = props.dataKey
    const barIndex = allBars.findIndex((b) => b.dataKey === dataKey)
    if (barIndex < 0) return []

    const fill = props.fill ?? 'currentColor'
    const radius = props.radius ?? 0
    const bandwidth = xs.bandwidth()
    const barWidth = allBars.length > 1 ? bandwidth / allBars.length : bandwidth
    const xKey = ctx.xDataKey()
    const innerH = ctx.innerHeight()
    const data = ctx.data()

    const result: {
      key: string
      x: number
      y: number
      width: number
      height: number
      fill: string
      rx: string | null
      ry: string | null
      xValue: string
      yValue: number
    }[] = []
    const rxAttr = radius > 0 ? String(radius) : null
    for (const datum of data) {
      const xValue = String(datum[xKey])
      const yValue = Number(datum[dataKey]) || 0
      const x = (xs(xValue) ?? 0) + barIndex * barWidth
      const y = ys(yValue)
      const barHeight = innerH - y
      if (barHeight <= 0) continue
      result.push({
        key: `${dataKey}-${xValue}`,
        x,
        y,
        width: barWidth,
        height: barHeight,
        fill,
        rx: rxAttr,
        ry: rxAttr,
        xValue,
        yValue,
      })
    }
    return result
  }
  const ctx = useContext(BarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.fill !== 'function' && !(typeof props.fill === 'object' && props.fill !== null && 'isEscaped' in props.fill)) __hydrateProps['fill'] = props.fill
  if (typeof props.radius !== 'function' && !(typeof props.radius === 'object' && props.radius !== null && 'isEscaped' in props.radius)) __hydrateProps['radius'] = props.radius
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={`${CHART_CLASS_BAR} ${CHART_CLASS_BAR}-${props.dataKey}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{bfComment('loop:l0')}{bars().map((b) => <rect key={b.key} x={String(b.x)} y={String(b.y)} width={String(b.width)} height={String(b.height)} fill={b.fill} rx={b.rx} ry={b.ry} data-x={b.xValue} data-y={String(b.yValue)} data-key={props.dataKey} data-key={String(b.key)} bf="s0" />)}{bfComment('/loop:l0')}</g>
  )
}

export function CartesianGrid(__allProps: CartesianGridProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `CartesianGrid_${Math.random().toString(36).slice(2, 8)}`
  const lines = () => {
    const result: { key: string; x1: number; x2: number; y1: number; y2: number }[] = []
    const ys = ctx.yScale()
    if (!ys) return result
    const innerW = ctx.innerWidth()
    if (props.horizontal !== false) {
      for (const tick of ys.ticks()) {
        const y = ys(tick)
        result.push({ key: `h-${tick}`, x1: 0, x2: innerW, y1: y, y2: y })
      }
    }
    if (props.vertical) {
      const innerH = ctx.innerHeight()
      const domainMax = ys.domain()[1] || 1
      for (const tick of ys.ticks()) {
        const x = (tick / domainMax) * innerW
        result.push({ key: `v-${tick}`, x1: x, x2: x, y1: 0, y2: innerH })
      }
    }
    return result
  }
  const ctx = useContext(BarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.vertical !== 'function' && !(typeof props.vertical === 'object' && props.vertical !== null && 'isEscaped' in props.vertical)) __hydrateProps['vertical'] = props.vertical
  if (typeof props.horizontal !== 'function' && !(typeof props.horizontal === 'object' && props.horizontal !== null && 'isEscaped' in props.horizontal)) __hydrateProps['horizontal'] = props.horizontal
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_GRID} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{bfComment('loop:l0')}{lines().map((l) => <line key={l.key} x1={String(l.x1)} x2={String(l.x2)} y1={String(l.y1)} y2={String(l.y2)} stroke="currentColor" stroke-opacity="0.1" data-key={String(l.key)} bf="s0" />)}{bfComment('/loop:l0')}</g>
  )
}

export function AreaCartesianGrid(__allProps: AreaCartesianGridProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AreaCartesianGrid_${Math.random().toString(36).slice(2, 8)}`
  const lines = () => {
    const result: { key: string; x1: number; x2: number; y1: number; y2: number }[] = []
    const ys = ctx.yScale()
    if (!ys) return result
    const innerW = ctx.innerWidth()
    if (props.horizontal !== false) {
      for (const tick of ys.ticks()) {
        const y = ys(tick)
        result.push({ key: `h-${tick}`, x1: 0, x2: innerW, y1: y, y2: y })
      }
    }
    if (props.vertical) {
      const innerH = ctx.innerHeight()
      const domainMax = ys.domain()[1] || 1
      for (const tick of ys.ticks()) {
        const x = (tick / domainMax) * innerW
        result.push({ key: `v-${tick}`, x1: x, x2: x, y1: 0, y2: innerH })
      }
    }
    return result
  }
  const ctx = useContext(AreaChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.vertical !== 'function' && !(typeof props.vertical === 'object' && props.vertical !== null && 'isEscaped' in props.vertical)) __hydrateProps['vertical'] = props.vertical
  if (typeof props.horizontal !== 'function' && !(typeof props.horizontal === 'object' && props.horizontal !== null && 'isEscaped' in props.horizontal)) __hydrateProps['horizontal'] = props.horizontal
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_GRID} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{bfComment('loop:l0')}{lines().map((l) => <line key={l.key} x1={String(l.x1)} x2={String(l.x2)} y1={String(l.y1)} y2={String(l.y2)} stroke="currentColor" stroke-opacity="0.1" data-key={String(l.key)} bf="s0" />)}{bfComment('/loop:l0')}</g>
  )
}

export function XAxis(__allProps: XAxisProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `XAxis_${Math.random().toString(36).slice(2, 8)}`
  const visible = () => !props.hide && ctx.xScale() !== null
  const axisRangeRight = () => {
    const xs = ctx.xScale()
    return xs ? xs.range()[1] : 0
  }
  const tickLabels = () => {
    if (!visible()) return []
    const xs = ctx.xScale()
    if (!xs) return []
    const bandwidth = xs.bandwidth()
    const formatter = props.tickFormatter
    return xs.domain().map((value) => ({
      x: (xs(value) ?? 0) + bandwidth / 2,
      label: formatter ? formatter(value) : value,
    }))
  }
  const ctx = useContext(BarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.tickFormatter !== 'function' && !(typeof props.tickFormatter === 'object' && props.tickFormatter !== null && 'isEscaped' in props.tickFormatter)) __hydrateProps['tickFormatter'] = props.tickFormatter
  if (typeof props.hide !== 'function' && !(typeof props.hide === 'object' && props.hide !== null && 'isEscaped' in props.hide)) __hydrateProps['hide'] = props.hide
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_X_AXIS} transform={`translate(0,${ctx.innerHeight()})`} style={`${visible() ? '' : 'display:none'}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><line x1="0" x2={String(axisRangeRight())} y1="0" y2="0" stroke="currentColor" stroke-opacity="0.1" bf="s0" />{bfComment('loop:l0')}{tickLabels().map((t) => <text key={String(t.label)} x={String(t.x)} y="20" text-anchor="middle" fill="currentColor" opacity="0.5" font-size="12" data-key={String(String(t.label))} bf="s2">{bfText("s1")}{t.label}{bfTextEnd()}</text>)}{bfComment('/loop:l0')}</g>
  )
}

export function YAxis(__allProps: YAxisProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `YAxis_${Math.random().toString(36).slice(2, 8)}`
  const visible = () => !props.hide && ctx.yScale() !== null
  const axisLineRange = () => {
    const ys = ctx.yScale()
    if (!ys) return { y1: 0, y2: 0 }
    const range = ys.range()
    return { y1: range[0], y2: range[1] }
  }
  const tickLabels = () => {
    if (!visible()) return []
    const ys = ctx.yScale()
    if (!ys) return []
    const formatter = props.tickFormatter
    return ys.ticks().map((tick) => ({
      y: ys(tick),
      label: formatter ? formatter(tick) : String(tick),
    }))
  }
  const ctx = useContext(BarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.hide !== 'function' && !(typeof props.hide === 'object' && props.hide !== null && 'isEscaped' in props.hide)) __hydrateProps['hide'] = props.hide
  if (typeof props.tickFormatter !== 'function' && !(typeof props.tickFormatter === 'object' && props.tickFormatter !== null && 'isEscaped' in props.tickFormatter)) __hydrateProps['tickFormatter'] = props.tickFormatter
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_Y_AXIS} style={`${visible() ? '' : 'display:none'}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><line x1="0" x2="0" y1={String(axisLineRange().y1)} y2={String(axisLineRange().y2)} stroke="currentColor" stroke-opacity="0.1" bf="s0" />{bfComment('loop:l0')}{tickLabels().map((t) => <text key={String(t.label)} x="-8" y={String(t.y)} text-anchor="end" dominant-baseline="middle" fill="currentColor" opacity="0.5" font-size="12" data-key={String(String(t.label))} bf="s2">{bfText("s1")}{t.label}{bfTextEnd()}</text>)}{bfComment('/loop:l0')}</g>
  )
}

export function ChartTooltip(__allProps: ChartTooltipProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `ChartTooltip_${Math.random().toString(36).slice(2, 8)}`
  const hover = () => TOOLTIP_INITIAL as TooltipState

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.labelFormatter !== 'function' && !(typeof props.labelFormatter === 'object' && props.labelFormatter !== null && 'isEscaped' in props.labelFormatter)) __hydrateProps['labelFormatter'] = props.labelFormatter
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <foreignObject x="0" y="0" width="1" height="1" style="overflow:visible;pointer-events:none" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s6"><div data-slot="chart-tooltip" className={CHART_CLASS_TOOLTIP} style={`${CHART_TOOLTIP_BODY_STYLE};left:${hover().x}px;top:${hover().y}px;opacity:${hover().visible ? '1' : '0'}`} bf="s5"><div style="font-weight:500;margin-bottom:4px" bf="s1">{bfText("s0")}{hover().label}{bfTextEnd()}</div>{bfComment('loop:l0')}{hover().rows.map((row) => <div key={row.label} style="display:flex;align-items:center;gap:8px" data-key={String(row.label)}><span style={`width:8px;height:8px;border-radius:2px;background:${row.color};display:inline-block`} bf="s2" /><span>{bfText("s3")}{row.label}{bfTextEnd()}</span><span style="font-weight:500;margin-left:auto">{bfText("s4")}{row.value}{bfTextEnd()}</span></div>)}{bfComment('/loop:l0')}</div></foreignObject>
  )
}

export function RadialChart(__allProps: RadialChartProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadialChart_${Math.random().toString(36).slice(2, 8)}`
  const width = () => 300
  const radialBars = () => [] as RadialBarRegistration[]
  const setRadialBars = (..._args: any[]) => {}
  const svgGroupEl = () => null as SVGGElement | null
  const containerEl = () => null as HTMLElement | null
  const height = () => width()
  const cx = () => width() / 2
  const cy = () => height() / 2
  const innerW = () => width() - CHART_RADIAL_MARGIN * 2
  const innerH = () => height() - CHART_RADIAL_MARGIN * 2
  const maxRadius = () => Math.min(innerW(), innerH()) / 2
  const chartCtx = useContext(ChartConfigContext)
  const registerRadialBar = (bar: RadialBarRegistration) => {
    setRadialBars((prev) => [...prev, bar])
  }
  const unregisterRadialBar = (dataKey: string) => {
    setRadialBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.data !== 'function' && !(typeof props.data === 'object' && props.data !== null && 'isEscaped' in props.data)) __hydrateProps['data'] = props.data
  if (typeof props.innerRadius !== 'function' && !(typeof props.innerRadius === 'object' && props.innerRadius !== null && 'isEscaped' in props.innerRadius)) __hydrateProps['innerRadius'] = props.innerRadius
  if (typeof props.outerRadius !== 'function' && !(typeof props.outerRadius === 'object' && props.outerRadius !== null && 'isEscaped' in props.outerRadius)) __hydrateProps['outerRadius'] = props.outerRadius
  if (typeof props.startAngle !== 'function' && !(typeof props.startAngle === 'object' && props.startAngle !== null && 'isEscaped' in props.startAngle)) __hydrateProps['startAngle'] = props.startAngle
  if (typeof props.endAngle !== 'function' && !(typeof props.endAngle === 'object' && props.endAngle !== null && 'isEscaped' in props.endAngle)) __hydrateProps['endAngle'] = props.endAngle
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(RadialChartContext, {
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
    }, <><div data-slot="radial-chart" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><svg viewBox={`0 0 ${width()} ${height()}`} style={`width:100%;height:${height()}px;display:block`} bf="s1"><g transform={`translate(${cx()},${cy()})`} bf="s0">{props.children}</g></svg></div></>)}</>
  )
}

export function RadialBar(__allProps: RadialBarProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadialBar_${Math.random().toString(36).slice(2, 8)}`
  const arcSpecs = () => {
    const dataKey = props.dataKey
    return buildRadialBarArcs(
      ctx.data(),
      dataKey,
      ctx.innerRadius(),
      ctx.outerRadius(),
      ctx.startAngle(),
      ctx.endAngle(),
    )
  }
  const arcEntries = () => {
    const entries: { key: string; role: 'track' | 'value'; d: string; fill: string; index: number; value: number }[] = []
    for (const spec of arcSpecs()) {
      if (spec.trackD != null) {
        entries.push({
          key: `t-${spec.index}`,
          role: 'track',
          d: spec.trackD,
          fill: 'currentColor',
          index: spec.index,
          value: spec.value,
        })
      }
      if (spec.arcD != null) {
        entries.push({
          key: `v-${spec.index}`,
          role: 'value',
          d: spec.arcD,
          fill: spec.itemFill ?? props.fill ?? 'currentColor',
          index: spec.index,
          value: spec.value,
        })
      }
    }
    return entries
  }
  const ctx = useContext(RadialChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.fill !== 'function' && !(typeof props.fill === 'object' && props.fill !== null && 'isEscaped' in props.fill)) __hydrateProps['fill'] = props.fill
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={`${CHART_CLASS_RADIAL_BAR} ${CHART_CLASS_RADIAL_BAR}-${props.dataKey}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3">{bfComment('loop:l0')}{arcEntries().map((entry) => <>{entry.role === 'track' ? <path bf-c="s0" key={entry.key} d={entry.d} fill={entry.fill} opacity="0.1" data-key={String(entry.key)} bf="s1" /> : <path bf-c="s0" key={entry.key} d={entry.d} fill={entry.fill} data-key={props.dataKey} data-value={String(entry.value)} data-index={String(entry.index)} data-key={String(entry.key)} bf="s2" />}</>)}{bfComment('/loop:l0')}</g>
  )
}

export function RadialChartLabel(__allProps: RadialChartLabelProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadialChartLabel_${Math.random().toString(36).slice(2, 8)}`
  const size = () => ctx.innerRadius() * 2 * 0.7
  const ctx = useContext(RadialChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <foreignObject x={String(-size() / 2)} y={String(-size() / 2)} width={String(size())} height={String(size())} className={CHART_CLASS_RADIAL_LABEL} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s0"><div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">{props.children}</div></foreignObject>
  )
}

export function RadarChart(__allProps: RadarChartProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadarChart_${Math.random().toString(36).slice(2, 8)}`
  const width = () => 500
  const radars = () => [] as RadarRegistration[]
  const setRadars = (..._args: any[]) => {}
  const dataKey = () => ''
  const setDataKey = (..._args: any[]) => {}
  const svgGroupEl = () => null as SVGGElement | null
  const containerEl = () => null as HTMLElement | null
  const radialScaleSig = () => null as ReturnType<typeof createRadarRadialScale>
  const height = () => Math.round(width() * CHART_RADAR_ASPECT)
  const innerW = () => width() - CHART_RADAR_MARGIN.left - CHART_RADAR_MARGIN.right
  const innerH = () => height() - CHART_RADAR_MARGIN.top - CHART_RADAR_MARGIN.bottom
  const radius = () => Math.min(innerW(), innerH()) / 2
  const cx = () => CHART_RADAR_MARGIN.left + innerW() / 2
  const cy = () => CHART_RADAR_MARGIN.top + innerH() / 2
  const chartCtx = useContext(ChartConfigContext)
  const registerRadar = (radar: RadarRegistration) => {
    setRadars((prev) => [...prev, radar])
  }
  const unregisterRadar = (dk: string) => {
    setRadars((prev) => prev.filter((r) => r.dataKey !== dk))
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.data !== 'function' && !(typeof props.data === 'object' && props.data !== null && 'isEscaped' in props.data)) __hydrateProps['data'] = props.data
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(RadarChartContext, {
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
    }, <><div data-slot="radar-chart" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><svg viewBox={`0 0 ${width()} ${height()}`} style={`width:100%;height:${height()}px;display:block`} bf="s1"><g transform={`translate(${cx()},${cy()})`} bf="s0">{props.children}</g></svg></div></>)}</>
  )
}

export function Radar(__allProps: RadarProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Radar_${Math.random().toString(36).slice(2, 8)}`
  const vertices = () => {
    const rs = ctx.radialScale()
    if (!rs) return []
    const axisKey = ctx.dataKey()
    if (!axisKey) return []
    return buildRadarVertices(ctx.data(), props.dataKey, axisKey, rs)
  }
  const polygonPoints = () => buildRadarPolygonPoints(vertices())
  const ctx = useContext(RadarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.fill !== 'function' && !(typeof props.fill === 'object' && props.fill !== null && 'isEscaped' in props.fill)) __hydrateProps['fill'] = props.fill
  if (typeof props.fillOpacity !== 'function' && !(typeof props.fillOpacity === 'object' && props.fillOpacity !== null && 'isEscaped' in props.fillOpacity)) __hydrateProps['fillOpacity'] = props.fillOpacity
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={`${CHART_CLASS_RADAR} ${CHART_CLASS_RADAR}-${props.dataKey}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><polygon points={polygonPoints()} fill={props.fill ?? 'currentColor'} fill-opacity={String(props.fillOpacity ?? 0.6)} stroke={props.fill ?? 'currentColor'} stroke-width="2" data-key={props.dataKey} bf="s0" />{bfComment('loop:l0')}{vertices().map((v) => <circle key={v.key} cx={String(v.x)} cy={String(v.y)} r="3" fill={props.fill ?? 'currentColor'} data-key={props.dataKey} data-axis={v.label} data-value={String(v.value)} data-key={String(v.key)} bf="s1" />)}{bfComment('/loop:l0')}</g>
  )
}

export function PolarGrid(__allProps: PolarGridProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PolarGrid_${Math.random().toString(36).slice(2, 8)}`
  const shapes = () => {
    if (props.show === false) return []
    const rs = ctx.radialScale()
    if (!rs) return []
    const data = ctx.data()
    const n = data.length
    if (n === 0) return []

    const result: PolarGridShape[] = []
    const angleStep = (2 * Math.PI) / n
    const gridType = props.gridType ?? 'polygon'

    for (const tick of rs.ticks(5)) {
      const r = rs(tick)
      if (r <= 0) continue
      if (gridType === 'circle') {
        result.push({ key: `c-${tick}`, kind: 'circle', r })
      } else {
        const points: string[] = []
        for (let i = 0; i < n; i++) {
          const angle = angleStep * i - Math.PI / 2
          points.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`)
        }
        result.push({ key: `p-${tick}`, kind: 'polygon', points: points.join(' ') })
      }
    }

    const radius = ctx.radius()
    for (let i = 0; i < n; i++) {
      const angle = angleStep * i - Math.PI / 2
      result.push({
        key: `s-${i}`,
        kind: 'spoke',
        x2: radius * Math.cos(angle),
        y2: radius * Math.sin(angle),
      })
    }
    return result
  }
  const ctx = useContext(RadarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.gridType !== 'function' && !(typeof props.gridType === 'object' && props.gridType !== null && 'isEscaped' in props.gridType)) __hydrateProps['gridType'] = props.gridType
  if (typeof props.show !== 'function' && !(typeof props.show === 'object' && props.show !== null && 'isEscaped' in props.show)) __hydrateProps['show'] = props.show
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_POLAR_GRID} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s5">{bfComment('loop:l0')}{shapes().map((shape) => <>{shape.kind === 'circle' ? <circle bf-c="s0" key={shape.key} cx="0" cy="0" r={String(shape.r)} fill="none" stroke="currentColor" stroke-opacity="0.1" data-key={String(shape.key)} bf="s1" /> : <>{bfComment("cond-start:s0")}{shape.kind === 'polygon' ? <polygon bf-c="s2" key={shape.key} points={shape.points} fill="none" stroke="currentColor" stroke-opacity="0.1" data-key={String(shape.key)} bf="s3" /> : <line bf-c="s2" key={shape.key} x1="0" y1="0" x2={String(shape.x2)} y2={String(shape.y2)} stroke="currentColor" stroke-opacity="0.1" data-key={String(shape.key)} bf="s4" />}{bfComment("cond-end:s0")}</>}</>)}{bfComment('/loop:l0')}</g>
  )
}

export function PolarAngleAxis(__allProps: PolarAngleAxisProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PolarAngleAxis_${Math.random().toString(36).slice(2, 8)}`
  const labels = () => {
    if (props.hide) return []
    const rs = ctx.radialScale()
    if (!rs) return []
    const data = ctx.data()
    const axisKey = ctx.dataKey()
    const n = data.length
    if (n === 0 || !axisKey) return []
    const radius = ctx.radius()
    const angleStep = (2 * Math.PI) / n
    const labelOffset = 16
    const formatter = props.tickFormatter
    return data.map((datum, i) => {
      const raw = String(datum[axisKey])
      const angle = angleStep * i - Math.PI / 2
      return {
        key: `${i}-${raw}`,
        x: (radius + labelOffset) * Math.cos(angle),
        y: (radius + labelOffset) * Math.sin(angle),
        label: formatter ? formatter(raw) : raw,
      }
    })
  }
  const ctx = useContext(RadarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.tickFormatter !== 'function' && !(typeof props.tickFormatter === 'object' && props.tickFormatter !== null && 'isEscaped' in props.tickFormatter)) __hydrateProps['tickFormatter'] = props.tickFormatter
  if (typeof props.hide !== 'function' && !(typeof props.hide === 'object' && props.hide !== null && 'isEscaped' in props.hide)) __hydrateProps['hide'] = props.hide
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_POLAR_ANGLE_AXIS} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2">{bfComment('loop:l0')}{labels().map((l) => <text key={l.key} x={String(l.x)} y={String(l.y)} text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="12" opacity="0.6" data-key={String(l.key)} bf="s1">{bfText("s0")}{l.label}{bfTextEnd()}</text>)}{bfComment('/loop:l0')}</g>
  )
}

export function RadarTooltip(__allProps: RadarTooltipProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `RadarTooltip_${Math.random().toString(36).slice(2, 8)}`
  const hover = () => TOOLTIP_INITIAL as TooltipState

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.labelFormatter !== 'function' && !(typeof props.labelFormatter === 'object' && props.labelFormatter !== null && 'isEscaped' in props.labelFormatter)) __hydrateProps['labelFormatter'] = props.labelFormatter
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <foreignObject x="0" y="0" width="1" height="1" style="overflow:visible;pointer-events:none" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s6"><div data-slot="radar-tooltip" className={CHART_CLASS_TOOLTIP} style={`${CHART_TOOLTIP_BODY_STYLE};left:${hover().x}px;top:${hover().y}px;opacity:${hover().visible ? '1' : '0'}`} bf="s5"><div style="font-weight:500;margin-bottom:4px" bf="s1">{bfText("s0")}{hover().label}{bfTextEnd()}</div>{bfComment('loop:l0')}{hover().rows.map((row) => <div key={row.label} style="display:flex;align-items:center;gap:8px" data-key={String(row.label)}><span style={`width:8px;height:8px;border-radius:2px;background:${row.color};display:inline-block`} bf="s2" /><span>{bfText("s3")}{row.label}{bfTextEnd()}</span><span style="font-weight:500;margin-left:auto">{bfText("s4")}{row.value}{bfTextEnd()}</span></div>)}{bfComment('/loop:l0')}</div></foreignObject>
  )
}

export function PieChart(__allProps: PieChartProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PieChart_${Math.random().toString(36).slice(2, 8)}`
  const width = () => 500
  const pies = () => [] as PieRegistration[]
  const setPies = (..._args: any[]) => {}
  const svgGroupEl = () => null as SVGGElement | null
  const containerEl = () => null as HTMLElement | null
  const height = () => Math.round(width() * CHART_PIE_ASPECT)
  const chartCtx = useContext(ChartConfigContext)
  const registerPie = (pie: PieRegistration) => {
    setPies((prev) => [...prev, pie])
  }
  const unregisterPie = (dataKey: string) => {
    setPies((prev) => prev.filter((p) => p.dataKey !== dataKey))
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.data !== 'function' && !(typeof props.data === 'object' && props.data !== null && 'isEscaped' in props.data)) __hydrateProps['data'] = props.data
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(PieChartContext, {
      svgGroup: svgGroupEl,
      container: containerEl,
      data: () => props.data ?? [],
      width,
      height,
      config: () => chartCtx.config,
      pies,
      registerPie,
      unregisterPie,
    }, <><div data-slot="pie-chart" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><svg viewBox={`0 0 ${width()} ${height()}`} style={`width:100%;height:${height()}px;display:block`} bf="s1"><g transform={`translate(${width() / 2},${height() / 2})`} bf="s0">{props.children}</g></svg></div></>)}</>
  )
}

export function Pie(__allProps: PieProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Pie_${Math.random().toString(36).slice(2, 8)}`
  const slices = () =>
    buildPieSlices(
      ctx.data(),
      props.dataKey,
      props.nameKey,
      ctx.config(),
      ctx.width(),
      ctx.height(),
      props.innerRadius ?? 0,
      props.outerRadius ?? 0.8,
      props.paddingAngle ?? 0,
    )
  const ctx = useContext(PieChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.nameKey !== 'function' && !(typeof props.nameKey === 'object' && props.nameKey !== null && 'isEscaped' in props.nameKey)) __hydrateProps['nameKey'] = props.nameKey
  if (typeof props.fill !== 'function' && !(typeof props.fill === 'object' && props.fill !== null && 'isEscaped' in props.fill)) __hydrateProps['fill'] = props.fill
  if (typeof props.innerRadius !== 'function' && !(typeof props.innerRadius === 'object' && props.innerRadius !== null && 'isEscaped' in props.innerRadius)) __hydrateProps['innerRadius'] = props.innerRadius
  if (typeof props.outerRadius !== 'function' && !(typeof props.outerRadius === 'object' && props.outerRadius !== null && 'isEscaped' in props.outerRadius)) __hydrateProps['outerRadius'] = props.outerRadius
  if (typeof props.paddingAngle !== 'function' && !(typeof props.paddingAngle === 'object' && props.paddingAngle !== null && 'isEscaped' in props.paddingAngle)) __hydrateProps['paddingAngle'] = props.paddingAngle
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={`${CHART_CLASS_PIE} ${CHART_CLASS_PIE}-${props.dataKey}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s1">{bfComment('loop:l0')}{slices().map((s) => <path key={s.name} d={s.d} fill={s.fill} data-name={s.name} data-value={String(s.value)} data-key={props.dataKey} data-key={String(s.name)} bf="s0" />)}{bfComment('/loop:l0')}</g>
  )
}

export function PieTooltip(__allProps: PieTooltipProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `PieTooltip_${Math.random().toString(36).slice(2, 8)}`
  const hover = () => TOOLTIP_INITIAL as TooltipState

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.labelFormatter !== 'function' && !(typeof props.labelFormatter === 'object' && props.labelFormatter !== null && 'isEscaped' in props.labelFormatter)) __hydrateProps['labelFormatter'] = props.labelFormatter
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <foreignObject x="0" y="0" width="1" height="1" style="overflow:visible;pointer-events:none" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s4"><div data-slot="pie-tooltip" className={CHART_CLASS_TOOLTIP} style={`${CHART_TOOLTIP_BODY_STYLE};left:${hover().x}px;top:${hover().y}px;opacity:${hover().visible ? '1' : '0'}`} bf="s3">{bfComment('loop:l0')}{hover().rows.map((row) => <div key={row.label} style="display:flex;align-items:center;gap:8px" data-key={String(row.label)}><span style={`width:8px;height:8px;border-radius:2px;background:${row.color};display:inline-block`} bf="s0" /><span>{bfText("s1")}{row.label}{bfTextEnd()}</span><span style="font-weight:500;margin-left:auto">{bfText("s2")}{row.value}{bfTextEnd()}</span></div>)}{bfComment('/loop:l0')}</div></foreignObject>
  )
}

export function AreaChart(__allProps: AreaChartProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AreaChart_${Math.random().toString(36).slice(2, 8)}`
  const width = () => 500
  const areas = () => [] as AreaRegistration[]
  const setAreas = (..._args: any[]) => {}
  const xDataKey = () => ''
  const setXDataKey = (..._args: any[]) => {}
  const svgGroupEl = () => null as SVGGElement | null
  const containerEl = () => null as HTMLElement | null
  const xScaleSig = () => null as ReturnType<typeof createPointScale> | null
  const yScaleSig = () => null as ReturnType<typeof createLinearScale> | null
  const height = () => Math.round(width() * CHART_AREA_ASPECT)
  const innerWidth = () => width() - CHART_AREA_MARGIN.left - CHART_AREA_MARGIN.right
  const innerHeight = () => height() - CHART_AREA_MARGIN.top - CHART_AREA_MARGIN.bottom
  const chartCtx = useContext(ChartConfigContext)
  const registerArea = (area: AreaRegistration) => {
    setAreas((prev) => [...prev, area])
  }
  const unregisterArea = (dataKey: string) => {
    setAreas((prev) => prev.filter((a) => a.dataKey !== dataKey))
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.data !== 'function' && !(typeof props.data === 'object' && props.data !== null && 'isEscaped' in props.data)) __hydrateProps['data'] = props.data
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(AreaChartContext, {
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
    }, <><div data-slot="area-chart" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><svg viewBox={`0 0 ${width()} ${height()}`} style={`width:100%;height:${height()}px;display:block`} bf="s1"><g transform={`translate(${CHART_AREA_MARGIN.left},${CHART_AREA_MARGIN.top})`} bf="s0">{props.children}</g></svg></div></>)}</>
  )
}

export function Area(__allProps: AreaProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Area_${Math.random().toString(36).slice(2, 8)}`
  const paths = () => {
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!xs || !ys) return { area: '', line: '' }
    return buildAreaPaths(
      ctx.data(),
      ctx.xDataKey(),
      props.dataKey,
      xs,
      ys,
      ctx.innerHeight(),
    )
  }
  const dots = () => {
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!xs || !ys) return []
    return buildAreaDots(ctx.data(), ctx.xDataKey(), props.dataKey, xs, ys)
  }
  const ctx = useContext(AreaChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.fill !== 'function' && !(typeof props.fill === 'object' && props.fill !== null && 'isEscaped' in props.fill)) __hydrateProps['fill'] = props.fill
  if (typeof props.stroke !== 'function' && !(typeof props.stroke === 'object' && props.stroke !== null && 'isEscaped' in props.stroke)) __hydrateProps['stroke'] = props.stroke
  if (typeof props.fillOpacity !== 'function' && !(typeof props.fillOpacity === 'object' && props.fillOpacity !== null && 'isEscaped' in props.fillOpacity)) __hydrateProps['fillOpacity'] = props.fillOpacity
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={`${CHART_CLASS_AREA} ${CHART_CLASS_AREA}-${props.dataKey}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><path d={paths().area} fill={props.fill ?? 'currentColor'} fill-opacity={String(props.fillOpacity ?? 0.2)} data-key={props.dataKey} bf="s0" /><path d={paths().line} fill="none" stroke={props.stroke ?? props.fill ?? 'currentColor'} stroke-width="2" data-key={props.dataKey} bf="s1" />{bfComment('loop:l0')}{dots().map((d) => <circle key={d.key} className={CHART_CLASS_AREA_DOT} cx={String(d.cx)} cy={String(d.cy)} r="12" fill="transparent" data-x={d.xValue} data-y={String(d.yValue)} data-key={props.dataKey} data-key={String(d.key)} bf="s2" />)}{bfComment('/loop:l0')}</g>
  )
}

export function AreaXAxis(__allProps: AreaXAxisProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AreaXAxis_${Math.random().toString(36).slice(2, 8)}`
  const visible = () => !props.hide && ctx.xScale() !== null
  const axisRangeRight = () => {
    const xs = ctx.xScale()
    return xs ? xs.range()[1] : 0
  }
  const tickLabels = () => {
    if (!visible()) return []
    const xs = ctx.xScale()
    if (!xs) return []
    const formatter = props.tickFormatter
    return xs.domain().map((value) => ({
      x: xs(value) ?? 0,
      label: formatter ? formatter(value) : value,
    }))
  }
  const ctx = useContext(AreaChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.tickFormatter !== 'function' && !(typeof props.tickFormatter === 'object' && props.tickFormatter !== null && 'isEscaped' in props.tickFormatter)) __hydrateProps['tickFormatter'] = props.tickFormatter
  if (typeof props.hide !== 'function' && !(typeof props.hide === 'object' && props.hide !== null && 'isEscaped' in props.hide)) __hydrateProps['hide'] = props.hide
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_X_AXIS} transform={`translate(0,${ctx.innerHeight()})`} style={`${visible() ? '' : 'display:none'}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><line x1="0" x2={String(axisRangeRight())} y1="0" y2="0" stroke="currentColor" stroke-opacity="0.1" bf="s0" />{bfComment('loop:l0')}{tickLabels().map((t) => <text key={String(t.label)} x={String(t.x)} y="20" text-anchor="middle" fill="currentColor" opacity="0.5" font-size="12" data-key={String(String(t.label))} bf="s2">{bfText("s1")}{t.label}{bfTextEnd()}</text>)}{bfComment('/loop:l0')}</g>
  )
}

export function AreaYAxis(__allProps: AreaYAxisProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AreaYAxis_${Math.random().toString(36).slice(2, 8)}`
  const visible = () => !props.hide && ctx.yScale() !== null
  const axisLineRange = () => {
    const ys = ctx.yScale()
    if (!ys) return { y1: 0, y2: 0 }
    const range = ys.range()
    return { y1: range[0], y2: range[1] }
  }
  const tickLabels = () => {
    if (!visible()) return []
    const ys = ctx.yScale()
    if (!ys) return []
    const formatter = props.tickFormatter
    return ys.ticks().map((tick) => ({
      y: ys(tick),
      label: formatter ? formatter(tick) : String(tick),
    }))
  }
  const ctx = useContext(AreaChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.hide !== 'function' && !(typeof props.hide === 'object' && props.hide !== null && 'isEscaped' in props.hide)) __hydrateProps['hide'] = props.hide
  if (typeof props.tickFormatter !== 'function' && !(typeof props.tickFormatter === 'object' && props.tickFormatter !== null && 'isEscaped' in props.tickFormatter)) __hydrateProps['tickFormatter'] = props.tickFormatter
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={CHART_CLASS_Y_AXIS} style={`${visible() ? '' : 'display:none'}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s3"><line x1="0" x2="0" y1={String(axisLineRange().y1)} y2={String(axisLineRange().y2)} stroke="currentColor" stroke-opacity="0.1" bf="s0" />{bfComment('loop:l0')}{tickLabels().map((t) => <text key={String(t.label)} x="-8" y={String(t.y)} text-anchor="end" dominant-baseline="middle" fill="currentColor" opacity="0.5" font-size="12" data-key={String(String(t.label))} bf="s2">{bfText("s1")}{t.label}{bfTextEnd()}</text>)}{bfComment('/loop:l0')}</g>
  )
}

export function AreaChartTooltip(__allProps: AreaChartTooltipProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `AreaChartTooltip_${Math.random().toString(36).slice(2, 8)}`
  const hover = () => TOOLTIP_INITIAL as TooltipState

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.labelFormatter !== 'function' && !(typeof props.labelFormatter === 'object' && props.labelFormatter !== null && 'isEscaped' in props.labelFormatter)) __hydrateProps['labelFormatter'] = props.labelFormatter
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <foreignObject x="0" y="0" width="1" height="1" style="overflow:visible;pointer-events:none" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s6"><div data-slot="area-chart-tooltip" className={CHART_CLASS_TOOLTIP} style={`${CHART_TOOLTIP_BODY_STYLE};left:${hover().x}px;top:${hover().y}px;opacity:${hover().visible ? '1' : '0'}`} bf="s5"><div style="font-weight:500;margin-bottom:4px" bf="s1">{bfText("s0")}{hover().label}{bfTextEnd()}</div>{bfComment('loop:l0')}{hover().rows.map((row) => <div key={row.label} style="display:flex;align-items:center;gap:8px" data-key={String(row.label)}><span style={`width:8px;height:8px;border-radius:2px;background:${row.color};display:inline-block`} bf="s2" /><span>{bfText("s3")}{row.label}{bfTextEnd()}</span><span style="font-weight:500;margin-left:auto">{bfText("s4")}{row.value}{bfTextEnd()}</span></div>)}{bfComment('/loop:l0')}</div></foreignObject>
  )
}

export function LineChart(__allProps: LineChartProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `LineChart_${Math.random().toString(36).slice(2, 8)}`
  const width = () => 500
  const bars = () => [] as BarRegistration[]
  const setBars = (..._args: any[]) => {}
  const xDataKey = () => ''
  const setXDataKey = (..._args: any[]) => {}
  const svgGroupEl = () => null as SVGGElement | null
  const containerEl = () => null as HTMLElement | null
  const xScaleSig = () => null as ReturnType<typeof createBandScale> | null
  const yScaleSig = () => null as ReturnType<typeof createLinearScale> | null
  const height = () => Math.round(width() * CHART_LINE_ASPECT)
  const innerWidth = () => width() - CHART_LINE_MARGIN.left - CHART_LINE_MARGIN.right
  const innerHeight = () => height() - CHART_LINE_MARGIN.top - CHART_LINE_MARGIN.bottom
  const chartCtx = useContext(ChartConfigContext)
  const registerBar = (bar: BarRegistration) => {
    setBars((prev) => [...prev, bar])
  }
  const unregisterBar = (dataKey: string) => {
    setBars((prev) => prev.filter((b) => b.dataKey !== dataKey))
  }

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.data !== 'function' && !(typeof props.data === 'object' && props.data !== null && 'isEscaped' in props.data)) __hydrateProps['data'] = props.data
  if (typeof props.children !== 'function' && !(typeof props.children === 'object' && props.children !== null && 'isEscaped' in props.children)) __hydrateProps['children'] = props.children
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <>{provideContextSSR(BarChartContext, {
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
    }, <><div data-slot="line-chart" bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><svg viewBox={`0 0 ${width()} ${height()}`} style={`width:100%;height:${height()}px;display:block`} bf="s1"><g transform={`translate(${CHART_LINE_MARGIN.left},${CHART_LINE_MARGIN.top})`} bf="s0">{props.children}</g></svg></div></>)}</>
  )
}

export function Line(__allProps: LineProps & { __instanceId?: string; __bfScope?: string; __bfChild?: boolean; __bfParentProps?: string; __bfParent?: string; __bfMount?: string; "data-key"?: string | number }) {
  const { __instanceId, __bfScope: _bfScope, __bfChild, __bfParentProps, __bfParent, __bfMount, "data-key": __dataKey, ...props } = __allProps
  const __scopeId = __instanceId || `Line_${Math.random().toString(36).slice(2, 8)}`
  const pathD = () => {
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!xs || !ys) return ''
    return buildLinePath(
      ctx.data(),
      ctx.xDataKey(),
      props.dataKey,
      xs,
      ys,
      props.type ?? 'monotone',
    )
  }
  const dots = () => {
    if (props.dot === false) return []
    const xs = ctx.xScale()
    const ys = ctx.yScale()
    if (!xs || !ys) return []
    return buildLinePoints(ctx.data(), ctx.xDataKey(), props.dataKey, xs, ys)
  }
  const ctx = useContext(BarChartContext)

  // Serialize props for client hydration
  const __hydrateProps: Record<string, unknown> = {}
  if (typeof props.dataKey !== 'function' && !(typeof props.dataKey === 'object' && props.dataKey !== null && 'isEscaped' in props.dataKey)) __hydrateProps['dataKey'] = props.dataKey
  if (typeof props.stroke !== 'function' && !(typeof props.stroke === 'object' && props.stroke !== null && 'isEscaped' in props.stroke)) __hydrateProps['stroke'] = props.stroke
  if (typeof props.strokeWidth !== 'function' && !(typeof props.strokeWidth === 'object' && props.strokeWidth !== null && 'isEscaped' in props.strokeWidth)) __hydrateProps['strokeWidth'] = props.strokeWidth
  if (typeof props.type !== 'function' && !(typeof props.type === 'object' && props.type !== null && 'isEscaped' in props.type)) __hydrateProps['type'] = props.type
  if (typeof props.dot !== 'function' && !(typeof props.dot === 'object' && props.dot !== null && 'isEscaped' in props.dot)) __hydrateProps['dot'] = props.dot
  const __bfPropsJson = __bfParentProps || (Object.keys(__hydrateProps).length > 0 ? JSON.stringify(__hydrateProps) : undefined)

  return (
    <g className={`${CHART_CLASS_LINE} ${CHART_CLASS_LINE}-${props.dataKey}`} bf-s={__scopeId} {...(__bfParent ? { "bf-h": __bfParent } : {})} {...(__bfMount ? { "bf-m": __bfMount } : {})} {...(!__bfChild ? { "bf-r": "" } : {})} {...(!__bfChild && __bfPropsJson ? { "bf-p": __bfPropsJson } : {})} {...(__dataKey !== undefined ? { "data-key": __dataKey } : {})} bf="s2"><path d={pathD()} fill="none" stroke={props.stroke ?? 'currentColor'} stroke-width={String(props.strokeWidth ?? 2)} data-key={props.dataKey} bf="s0" />{bfComment('loop:l0')}{dots().map((d) => <circle key={d.key} cx={String(d.cx)} cy={String(d.cy)} r="4" fill={props.stroke ?? 'currentColor'} data-x={d.xValue} data-y={String(d.yValue)} data-key={props.dataKey} data-key={String(d.key)} bf="s1" />)}{bfComment('/loop:l0')}</g>
  )
}