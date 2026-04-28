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

import { createSignal, createMemo, createEffect, onCleanup, useContext } from '@barefootjs/client'
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
  buildRadialBarArcs,
  CHART_CLASS_GRID,
  CHART_CLASS_X_AXIS,
  CHART_CLASS_Y_AXIS,
  CHART_CLASS_POLAR_GRID,
  CHART_CLASS_POLAR_ANGLE_AXIS,
  CHART_CLASS_RADIAL_BAR,
  initBar as barInit,
  initArea as areaInit,
  initChartTooltip as chartTooltipInit,
  initRadialChartLabel as radialChartLabelInit,
  initRadar as radarInit,
  initRadarTooltip as radarTooltipInit,
  initPie as pieInit,
  initPieTooltip as pieTooltipInit,
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

// Horizontal + vertical grid lines flattened into a single list. Two sibling
// `.map()`s inside the same parent collide on `findLoopMarkers` (it picks the
// last `<!--bf-loop-->` pair, so both maps end up writing to the same DOM
// range). The reactive props are read inline rather than via a helper to keep
// the analyzer's `propUsage` graph aware of `props.horizontal`/`props.vertical`
// — when usage hides behind a function call the compiler falls back to
// emitting unknown props as DOM attributes on the root element.
function CartesianGrid(props: CartesianGridProps) {
  const ctx = useContext(BarChartContext)

  const lines = createMemo(() => {
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
  })

  return (
    <g className={CHART_CLASS_GRID}>
      {lines().map((l) => (
        <line
          key={l.key}
          x1={String(l.x1)}
          x2={String(l.x2)}
          y1={String(l.y1)}
          y2={String(l.y2)}
          stroke="currentColor"
          strokeOpacity="0.1"
        />
      ))}
    </g>
  )
}

function AreaCartesianGrid(props: AreaCartesianGridProps) {
  const ctx = useContext(AreaChartContext)

  const lines = createMemo(() => {
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
  })

  return (
    <g className={CHART_CLASS_GRID}>
      {lines().map((l) => (
        <line
          key={l.key}
          x1={String(l.x1)}
          x2={String(l.x2)}
          y1={String(l.y1)}
          y2={String(l.y2)}
          stroke="currentColor"
          strokeOpacity="0.1"
        />
      ))}
    </g>
  )
}

function XAxis(props: XAxisProps) {
  const ctx = useContext(BarChartContext)

  // Inform the chart container which key drives the x scale. Runs as an
  // effect so a reactive `dataKey` (e.g. via signal) re-syncs the scale.
  createEffect(() => {
    ctx.setXDataKey(props.dataKey)
  })

  const visible = createMemo(() => !props.hide && ctx.xScale() !== null)

  const axisRangeRight = createMemo(() => {
    const xs = ctx.xScale()
    return xs ? xs.range()[1] : 0
  })

  const tickLabels = createMemo(() => {
    if (!visible()) return []
    const xs = ctx.xScale()
    if (!xs) return []
    const bandwidth = xs.bandwidth()
    const formatter = props.tickFormatter
    return xs.domain().map((value) => ({
      x: (xs(value) ?? 0) + bandwidth / 2,
      label: formatter ? formatter(value) : value,
    }))
  })

  return (
    <g
      className={CHART_CLASS_X_AXIS}
      transform={`translate(0,${ctx.innerHeight()})`}
      style={visible() ? '' : 'display:none'}
    >
      <line
        x1="0"
        x2={String(axisRangeRight())}
        y1="0"
        y2="0"
        stroke="currentColor"
        strokeOpacity="0.1"
      />
      {tickLabels().map((t) => (
        <text
          key={String(t.label)}
          x={String(t.x)}
          y="20"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.5"
          fontSize="12"
        >{t.label}</text>
      ))}
    </g>
  )
}

function YAxis(props: YAxisProps) {
  const ctx = useContext(BarChartContext)

  const visible = createMemo(() => !props.hide && ctx.yScale() !== null)

  const axisLineRange = createMemo(() => {
    const ys = ctx.yScale()
    if (!ys) return { y1: 0, y2: 0 }
    const range = ys.range()
    return { y1: range[0], y2: range[1] }
  })

  const tickLabels = createMemo(() => {
    if (!visible()) return []
    const ys = ctx.yScale()
    if (!ys) return []
    const formatter = props.tickFormatter
    return ys.ticks().map((tick) => ({
      y: ys(tick),
      label: formatter ? formatter(tick) : String(tick),
    }))
  })

  return (
    <g className={CHART_CLASS_Y_AXIS} style={visible() ? '' : 'display:none'}>
      <line
        x1="0"
        x2="0"
        y1={String(axisLineRange().y1)}
        y2={String(axisLineRange().y2)}
        stroke="currentColor"
        strokeOpacity="0.1"
      />
      {tickLabels().map((t) => (
        <text
          key={String(t.label)}
          x="-8"
          y={String(t.y)}
          textAnchor="end"
          dominantBaseline="middle"
          fill="currentColor"
          opacity="0.5"
          fontSize="12"
        >{t.label}</text>
      ))}
    </g>
  )
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
  const ctx = useContext(RadialChartContext)

  // Mirror initRadialBar's registration handshake: register on every
  // dataKey change, deregister the previous key, and clean up on unmount.
  let currentDataKey: string | null = null
  createEffect(() => {
    const dataKey = props.dataKey
    const fill = props.fill ?? 'currentColor'
    if (currentDataKey !== null) {
      ctx.unregisterRadialBar(currentDataKey)
    }
    ctx.registerRadialBar({ dataKey, fill })
    currentDataKey = dataKey
  })
  onCleanup(() => {
    if (currentDataKey !== null) ctx.unregisterRadialBar(currentDataKey)
  })

  const arcSpecs = createMemo(() => {
    const dataKey = props.dataKey
    return buildRadialBarArcs(
      ctx.data(),
      dataKey,
      ctx.innerRadius(),
      ctx.outerRadius(),
      ctx.startAngle(),
      ctx.endAngle(),
    )
  })

  // Each ring contributes a track <path> followed by a value <path>; to keep
  // the keyed reconciler happy we flatten them into a single list keyed by
  // ring index + role rather than nesting them under a Fragment.
  const arcEntries = createMemo(() => {
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
  })

  return (
    <g className={`${CHART_CLASS_RADIAL_BAR} ${CHART_CLASS_RADIAL_BAR}-${props.dataKey}`}>
      {arcEntries().map((entry) =>
        entry.role === 'track' ? (
          <path key={entry.key} d={entry.d} fill={entry.fill} opacity="0.1" />
        ) : (
          <path
            key={entry.key}
            d={entry.d}
            fill={entry.fill}
            data-key={props.dataKey}
            data-value={String(entry.value)}
            data-index={String(entry.index)}
          />
        )
      )}
    </g>
  )
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

type PolarGridShape =
  | { key: string; kind: 'circle'; r: number }
  | { key: string; kind: 'polygon'; points: string }
  | { key: string; kind: 'spoke'; x2: number; y2: number }

function PolarGrid(props: PolarGridProps) {
  const ctx = useContext(RadarChartContext)

  // Concentric rings + radial spokes flattened into one list. Two sibling
  // `<g>` `.map()`s collide on the loop-marker lookup (see CartesianGrid).
  const shapes = createMemo<PolarGridShape[]>(() => {
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
  })

  return (
    <g className={CHART_CLASS_POLAR_GRID}>
      {shapes().map((shape) =>
        shape.kind === 'circle' ? (
          <circle
            key={shape.key}
            cx="0"
            cy="0"
            r={String(shape.r)}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.1"
          />
        ) : shape.kind === 'polygon' ? (
          <polygon
            key={shape.key}
            points={shape.points}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.1"
          />
        ) : (
          <line
            key={shape.key}
            x1="0"
            y1="0"
            x2={String(shape.x2)}
            y2={String(shape.y2)}
            stroke="currentColor"
            strokeOpacity="0.1"
          />
        )
      )}
    </g>
  )
}

function PolarAngleAxis(props: PolarAngleAxisProps) {
  const ctx = useContext(RadarChartContext)

  // Mirror initPolarAngleAxis: a separate effect declares the axis key on
  // the parent context so RadarChart can refresh its scale.
  createEffect(() => {
    if (props.dataKey) ctx.setDataKey(props.dataKey)
  })

  const labels = createMemo(() => {
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
  })

  return (
    <g className={CHART_CLASS_POLAR_ANGLE_AXIS}>
      {labels().map((l) => (
        <text
          key={l.key}
          x={String(l.x)}
          y={String(l.y)}
          textAnchor="middle"
          dominantBaseline="central"
          fill="currentColor"
          fontSize="12"
          opacity="0.6"
        >{l.label}</text>
      ))}
    </g>
  )
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

function AreaXAxis(props: AreaXAxisProps) {
  const ctx = useContext(AreaChartContext)

  createEffect(() => {
    ctx.setXDataKey(props.dataKey)
  })

  const visible = createMemo(() => !props.hide && ctx.xScale() !== null)

  const axisRangeRight = createMemo(() => {
    const xs = ctx.xScale()
    return xs ? xs.range()[1] : 0
  })

  // Point scale: each label sits exactly on the scaled position (no
  // bandwidth/2 offset like the band scale used by BarChart's XAxis).
  const tickLabels = createMemo(() => {
    if (!visible()) return []
    const xs = ctx.xScale()
    if (!xs) return []
    const formatter = props.tickFormatter
    return xs.domain().map((value) => ({
      x: xs(value) ?? 0,
      label: formatter ? formatter(value) : value,
    }))
  })

  return (
    <g
      className={CHART_CLASS_X_AXIS}
      transform={`translate(0,${ctx.innerHeight()})`}
      style={visible() ? '' : 'display:none'}
    >
      <line
        x1="0"
        x2={String(axisRangeRight())}
        y1="0"
        y2="0"
        stroke="currentColor"
        strokeOpacity="0.1"
      />
      {tickLabels().map((t) => (
        <text
          key={String(t.label)}
          x={String(t.x)}
          y="20"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.5"
          fontSize="12"
        >{t.label}</text>
      ))}
    </g>
  )
}

function AreaYAxis(props: AreaYAxisProps) {
  const ctx = useContext(AreaChartContext)

  const visible = createMemo(() => !props.hide && ctx.yScale() !== null)

  const axisLineRange = createMemo(() => {
    const ys = ctx.yScale()
    if (!ys) return { y1: 0, y2: 0 }
    const range = ys.range()
    return { y1: range[0], y2: range[1] }
  })

  const tickLabels = createMemo(() => {
    if (!visible()) return []
    const ys = ctx.yScale()
    if (!ys) return []
    const formatter = props.tickFormatter
    return ys.ticks().map((tick) => ({
      y: ys(tick),
      label: formatter ? formatter(tick) : String(tick),
    }))
  })

  return (
    <g className={CHART_CLASS_Y_AXIS} style={visible() ? '' : 'display:none'}>
      <line
        x1="0"
        x2="0"
        y1={String(axisLineRange().y1)}
        y2={String(axisLineRange().y2)}
        stroke="currentColor"
        strokeOpacity="0.1"
      />
      {tickLabels().map((t) => (
        <text
          key={String(t.label)}
          x="-8"
          y={String(t.y)}
          textAnchor="end"
          dominantBaseline="middle"
          fill="currentColor"
          opacity="0.5"
          fontSize="12"
        >{t.label}</text>
      ))}
    </g>
  )
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
