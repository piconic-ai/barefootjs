"use client"
/**
 * PieChartDemo Components
 *
 * Interactive demos for the Pie Chart component.
 * Uses JSX component API with @barefootjs/chart.
 */

import { createSignal, createEffect, onCleanup } from '@barefootjs/client'
import type { ChartConfig } from '@barefootjs/chart'
import { buildPieSlices } from '@barefootjs/chart'
import {
  ChartContainer,
  PieChart,
  Pie,
  PieTooltip,
} from '@ui/components/ui/chart'

const chartConfig: ChartConfig = {
  done: { label: 'Done', color: 'hsl(220 14% 30%)' },
  inProgress: { label: 'In Progress', color: 'hsl(220 14% 50%)' },
  todo: { label: 'To Do', color: 'hsl(220 14% 70%)' },
  backlog: { label: 'Backlog', color: 'hsl(220 14% 85%)' },
}

const chartData = [
  { status: 'done', tasks: 42 },
  { status: 'inProgress', tasks: 18 },
  { status: 'todo', tasks: 25 },
  { status: 'backlog', tasks: 15 },
]

/**
 * Preview demo — task status pie chart
 */
export function PieChartPreviewDemo() {
  return (
    <div className="w-full space-y-2">
      <div>
        <h4 className="text-sm font-medium">Task Status</h4>
        <p className="text-xs text-muted-foreground">Current Sprint</p>
      </div>
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={chartData}>
          <PieTooltip />
          <Pie dataKey="tasks" nameKey="status" />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Basic demo — minimal pie chart
 */
export function PieChartBasicDemo() {
  return (
    <div className="w-full">
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={chartData}>
          <Pie dataKey="tasks" nameKey="status" />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Donut demo — pie chart with inner radius
 */
export function PieChartDonutDemo() {
  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-4 flex-wrap">
        {Object.entries(chartConfig).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={`background:${cfg.color}`} />
            <span className="text-xs text-muted-foreground">{cfg.label}</span>
          </div>
        ))}
      </div>
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={chartData}>
          <PieTooltip />
          <Pie dataKey="tasks" nameKey="status" innerRadius={0.4} />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Interactive demo — signal-driven metric switching
 */
export function PieChartInteractiveDemo() {
  const interactiveData = [
    { status: 'done', tasks: 42, points: 68 },
    { status: 'inProgress', tasks: 18, points: 32 },
    { status: 'todo', tasks: 25, points: 40 },
    { status: 'backlog', tasks: 15, points: 20 },
  ]

  const [metric, setMetric] = createSignal<'tasks' | 'points'>('tasks')

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Metric:</span>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            metric() === 'tasks'
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setMetric('tasks')}
        >
          Tasks
        </button>
        <button
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-8 px-3 ${
            metric() === 'points'
              ? 'bg-primary text-primary-foreground'
              : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
          }`}
          onClick={() => setMetric('points')}
        >
          Points
        </button>
      </div>
      <ChartContainer config={chartConfig} className="w-full max-w-[400px] mx-auto">
        <PieChart data={interactiveData}>
          <PieTooltip />
          <Pie dataKey={metric()} nameKey="status" innerRadius={0.3} paddingAngle={2} />
        </PieChart>
      </ChartContainer>
    </div>
  )
}

/**
 * Animated demo — rAF-driven reactive SVG attributes.
 *
 * Each `<path>` slice has reactive `stroke-dasharray` / `stroke-dashoffset`
 * AND reactive `fill-opacity` driven by a progress signal that climbs 0 → 1
 * via requestAnimationFrame each time the "Animate" toggle is enabled. The
 * combination is what makes the animation visible: stroke-dashoffset alone
 * only animates the thin separator stroke (which is barely perceptible
 * against the solid fill), so we also fade the fill in. Exercises four
 * compiler paths in one demo:
 *
 *   1. SVG presentation attribute reactive binding (`stroke-dasharray` /
 *      `stroke-dashoffset`) inside a `.map()` body.
 *   2. Reactive numeric SVG attribute (`fill-opacity`) inside the same
 *      `.map()` body, driving the visible reveal.
 *   3. `requestAnimationFrame` loop owned by a `createEffect`, with
 *      `cancelAnimationFrame` in `onCleanup` so toggling off mid-flight
 *      releases the frame handle.
 *   4. High-frequency signal updates (one tick per animation frame) driving
 *      DOM attribute writes without intervening user input.
 *
 * Why `pathLength="1"`: SVG `pathLength` normalises the path's length for
 * stroke-dash math so the offset arithmetic is independent of the actual
 * geometric length. Without it the dash math depended on `~809px` (the real
 * path length for these slices) being close to a hard-coded `800` constant,
 * which left only `~9px` of visual travel and made the stroke animation
 * effectively invisible (the underlying bug behind #135 reports).
 */
const ANIMATED_DURATION_MS = 1200

export function PieChartAnimatedDemo() {
  const [animating, setAnimating] = createSignal(false)
  const [progress, setProgress] = createSignal(1)

  const slices = buildPieSlices(
    chartData,
    'tasks',
    'status',
    chartConfig,
    400,
    400,
    0.3,
    0.85,
    2,
  )

  createEffect(() => {
    if (!animating()) return

    setProgress(0)
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ANIMATED_DURATION_MS)
      setProgress(t)
      if (t < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        setAnimating(false)
      }
    }
    frame = requestAnimationFrame(tick)
    onCleanup(() => cancelAnimationFrame(frame))
  })

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-anim-toggle
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-medium h-8 px-3 hover:bg-primary/90"
          onClick={() => setAnimating(true)}
          disabled={animating()}
        >
          {animating() ? 'Animating…' : 'Animate'}
        </button>
        <span className="text-xs text-muted-foreground">
          fill-opacity & stroke-dashoffset are driven by requestAnimationFrame
        </span>
      </div>
      <svg
        viewBox="0 0 400 400"
        style="width:100%;max-width:400px;height:auto;display:block;margin:0 auto"
      >
        <g transform="translate(200,200)">
          {slices.map((s) => (
            <path
              key={s.name}
              d={s.d}
              fill={s.fill}
              fill-opacity={String(progress())}
              stroke="hsl(0 0% 100% / 0.85)"
              stroke-width="2"
              pathLength="1"
              stroke-dasharray="1"
              stroke-dashoffset={String(1 - progress())}
              data-name={s.name}
              data-value={String(s.value)}
              data-anim-path
            />
          ))}
        </g>
      </svg>
    </div>
  )
}
