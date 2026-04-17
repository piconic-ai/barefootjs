"use client"
/**
 * DashboardBuilderDemo
 *
 * Dynamic widget composition with per-widget signal isolation.
 *
 * Compiler stress targets:
 * - Per-widget signal isolation: each child widget owns its internal signals.
 *   Multiple instances of the same widget type each get an isolated reactive scope.
 * - Dynamic component switching inside .map(): the loop body renders different
 *   child components based on config.type — a ternary chain returning distinct
 *   JSX element types (StatWidget / ProgressWidget / TodoWidget / ChartWidget).
 * - Layout memo dependent on widget count: gridCols memo recomputes grid class
 *   from widgets().length, driving dynamic CSS class updates on the container.
 * - Independent signal trees: interacting with one widget (e.g., incrementing
 *   StatWidget A) must not invalidate memos or trigger updates in sibling widgets.
 * - Loop rebuild on config change: adding/removing/moving widgets reshapes the
 *   loop, and new child components initialize with their own fresh signal state.
 */

import { createSignal, createMemo } from '@barefootjs/client'
import { Badge } from '@ui/components/ui/badge'
import { Button } from '@ui/components/ui/button'

import {
  ArrowUpDownIcon,
  CheckIcon,
} from '@ui/components/ui/icon'

// --- Types ---

type WidgetType = 'stat' | 'progress' | 'todo' | 'chart'
type WidgetSize = 'sm' | 'md' | 'lg'

type WidgetConfig = {
  id: number
  type: WidgetType
  title: string
  size: WidgetSize
}

// --- Data ---

let _nextId = 100
function nextWidgetId(): number {
  return _nextId++
}

const initialWidgets: WidgetConfig[] = [
  { id: 1, type: 'stat', title: 'Revenue', size: 'sm' },
  { id: 2, type: 'progress', title: 'Quarterly Goal', size: 'sm' },
  { id: 3, type: 'todo', title: 'Action Items', size: 'sm' },
  { id: 4, type: 'chart', title: 'Weekly Visits', size: 'sm' },
]

const WIDGET_LABELS: Record<WidgetType, string> = {
  stat: 'Stat',
  progress: 'Progress',
  todo: 'Todo',
  chart: 'Chart',
}

// --- Child Widgets (each with its own signal scope) ---

type StatWidgetProps = {
  initialValue: number
  step: number
}

export function StatWidget(props: StatWidgetProps) {
  const [value, setValue] = createSignal(props.initialValue)
  const [startValue] = createSignal(props.initialValue)

  const delta = createMemo(() => value() - startValue())
  const trendLabel = createMemo(() => {
    const d = delta()
    if (d > 0) return `+${d}`
    if (d < 0) return String(d)
    return '±0'
  })
  const trendClass = createMemo(() => {
    const d = delta()
    if (d > 0) return 'text-emerald-600 dark:text-emerald-400'
    if (d < 0) return 'text-rose-600 dark:text-rose-400'
    return 'text-muted-foreground'
  })

  return (
    <div className="stat-widget flex flex-col gap-2 h-full">
      <div className="text-3xl font-semibold tabular-nums stat-value">
        {value()}
      </div>
      <div className={`text-xs font-medium tabular-nums stat-trend ${trendClass()}`}>
        {trendLabel()}
      </div>
      <div className="flex items-center gap-1 mt-auto">
        <button
          type="button"
          className="stat-decrement inline-flex items-center justify-center w-7 h-7 rounded-md border border-input bg-background text-sm hover:bg-accent"
          onClick={() => setValue(value() - props.step)}
          aria-label="Decrement"
        >−</button>
        <button
          type="button"
          className="stat-increment inline-flex items-center justify-center w-7 h-7 rounded-md border border-input bg-background text-sm hover:bg-accent"
          onClick={() => setValue(value() + props.step)}
          aria-label="Increment"
        >+</button>
      </div>
    </div>
  )
}

type ProgressWidgetProps = {
  initialProgress: number
}

export function ProgressWidget(props: ProgressWidgetProps) {
  const [progress, setProgress] = createSignal(props.initialProgress)

  const clamped = createMemo(() => Math.max(0, Math.min(100, progress())))
  const barStyle = createMemo(() => `width: ${clamped()}%`)
  const label = createMemo(() => `${clamped()}%`)
  const status = createMemo(() => {
    const p = clamped()
    if (p >= 100) return 'Complete'
    if (p >= 75) return 'On track'
    if (p >= 40) return 'In progress'
    return 'Behind'
  })

  return (
    <div className="progress-widget flex flex-col gap-3 h-full">
      <div className="flex items-baseline justify-between">
        <div className="text-2xl font-semibold tabular-nums progress-label">
          {label()}
        </div>
        <div className="text-xs text-muted-foreground progress-status">
          {status()}
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="progress-bar h-full bg-primary transition-all"
          style={barStyle()}
        />
      </div>
      <div className="flex items-center gap-1 mt-auto">
        <button
          type="button"
          className="progress-decrement inline-flex items-center justify-center h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent"
          onClick={() => setProgress(clamped() - 10)}
        >-10%</button>
        <button
          type="button"
          className="progress-increment inline-flex items-center justify-center h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent"
          onClick={() => setProgress(clamped() + 10)}
        >+10%</button>
        <button
          type="button"
          className="progress-reset inline-flex items-center justify-center h-7 px-2 text-xs rounded-md hover:bg-accent ml-auto text-muted-foreground"
          onClick={() => setProgress(0)}
        >Reset</button>
      </div>
    </div>
  )
}

type TodoItem = {
  id: number
  text: string
  done: boolean
}

export function TodoWidget() {
  const [todos, setTodos] = createSignal<TodoItem[]>([
    { id: 1, text: 'Review PRs', done: false },
    { id: 2, text: 'Ship release', done: false },
    { id: 3, text: 'Write docs', done: true },
  ])
  const [draft, setDraft] = createSignal('')

  const remaining = createMemo(() => todos().filter((t: TodoItem) => !t.done).length)
  const total = createMemo(() => todos().length)
  const summary = createMemo(() => `${remaining()} of ${total()} remaining`)

  let _todoId = 100
  const addTodo = () => {
    const text = draft().trim()
    if (text.length === 0) return
    setTodos((prev: TodoItem[]) => [...prev, { id: ++_todoId, text, done: false }])
    setDraft('')
  }

  const toggleTodo = (id: number) => {
    setTodos((prev: TodoItem[]) => prev.map((t: TodoItem) => t.id === id ? { ...t, done: !t.done } : t))
  }

  const removeTodo = (id: number) => {
    setTodos((prev: TodoItem[]) => prev.filter((t: TodoItem) => t.id !== id))
  }

  return (
    <div className="todo-widget flex flex-col gap-2 h-full">
      <div className="text-xs text-muted-foreground todo-summary">
        {summary()}
      </div>
      <div className="space-y-1 todo-list max-h-40 overflow-y-auto">
        {todos().map((t: TodoItem) => (
          <div
            key={t.id}
            className={`todo-item flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent/40${t.done ? ' todo-item-done' : ''}`}
            onClick={() => {}}
          >
            <button
              type="button"
              className={`todo-toggle w-4 h-4 rounded border flex items-center justify-center shrink-0${t.done ? ' bg-primary border-primary text-primary-foreground' : ' border-input'}`}
              onClick={() => toggleTodo(t.id)}
              aria-pressed={t.done}
              aria-label={t.done ? 'Mark incomplete' : 'Mark complete'}
            >
              {t.done ? <CheckIcon className="w-3 h-3" /> : null}
            </button>
            <span className={`flex-1 truncate${t.done ? ' line-through text-muted-foreground' : ''}`}>
              {t.text}
            </span>
            <button
              type="button"
              className="todo-remove inline-flex items-center justify-center w-5 h-5 rounded-md text-muted-foreground opacity-40 hover:opacity-100 hover:bg-accent shrink-0 text-xs"
              onClick={() => removeTodo(t.id)}
              aria-label="Remove todo"
            >×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1 mt-auto">
        <input
          type="text"
          value={draft()}
          onInput={(e: any) => setDraft(e.target.value)}
          placeholder="Add an item…"
          className="todo-input flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs"
        />
        <button
          type="button"
          className="todo-add inline-flex items-center justify-center h-7 px-2 text-xs rounded-md border border-input bg-background hover:bg-accent"
          onClick={addTodo}
        >Add</button>
      </div>
    </div>
  )
}

type ChartBar = {
  label: string
  value: number
}

type ChartWidgetProps = {
  initialBars: ChartBar[]
}

export function ChartWidget(props: ChartWidgetProps) {
  const [bars, setBars] = createSignal<ChartBar[]>(props.initialBars)
  const [selectedKey, setSelectedKey] = createSignal<string>('')

  const maxValue = createMemo(() => {
    const vs = bars().map((b: ChartBar) => b.value)
    return vs.length > 0 ? Math.max(...vs) : 1
  })
  const total = createMemo(() => bars().reduce((s: number, b: ChartBar) => s + b.value, 0))
  const selectedLabel = createMemo(() => selectedKey() || 'Total')
  const selectedValue = createMemo(() => {
    const k = selectedKey()
    if (!k) return total()
    const match = bars().find((b: ChartBar) => b.label === k)
    return match ? match.value : 0
  })

  const bumpSelected = (delta: number) => {
    const k = selectedKey()
    if (!k) return
    setBars((prev: ChartBar[]) => prev.map((b: ChartBar) => b.label === k ? { ...b, value: Math.max(0, b.value + delta) } : b))
  }

  const toggleBar = (label: string) => {
    setSelectedKey(selectedKey() === label ? '' : label)
  }

  return (
    <div className="chart-widget flex flex-col gap-2 h-full">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs text-muted-foreground chart-selected-label">
            {selectedLabel()}
          </div>
          <div className="text-2xl font-semibold tabular-nums chart-selected-value">
            {selectedValue()}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="chart-decrement inline-flex items-center justify-center w-7 h-7 rounded-md border border-input bg-background text-sm hover:bg-accent"
            onClick={() => bumpSelected(-5)}
            aria-label="Decrement selected bar"
          >−</button>
          <button
            type="button"
            className="chart-increment inline-flex items-center justify-center w-7 h-7 rounded-md border border-input bg-background text-sm hover:bg-accent"
            onClick={() => bumpSelected(5)}
            aria-label="Increment selected bar"
          >+</button>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-24 chart-bars">
        {bars().map((b: ChartBar) => (
          <button
            key={b.label}
            type="button"
            className={`chart-bar flex-1 h-full flex flex-col justify-end rounded-sm overflow-hidden bg-transparent p-0 border-0${selectedKey() === b.label ? ' chart-bar-selected' : ''}`}
            onClick={() => toggleBar(b.label)}
            aria-label={`${b.label}: ${b.value}`}
            aria-pressed={selectedKey() === b.label}
          >
            <span
              className={`chart-bar-fill block w-full rounded-sm transition-colors${selectedKey() === b.label ? ' bg-primary' : ' bg-primary/30 hover:bg-primary/50'}`}
              style={`height: ${Math.round((b.value / maxValue()) * 100)}%`}
            />
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {bars().map((b: ChartBar) => (
          <span key={b.label} className="chart-bar-label flex-1 text-center">
            {b.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// --- Parent component ---

const STAT_PRESETS = [
  { value: 24500, step: 100 },
  { value: 128, step: 1 },
  { value: 42, step: 5 },
]

const CHART_PRESETS: ChartBar[][] = [
  [
    { label: 'Mon', value: 12 },
    { label: 'Tue', value: 18 },
    { label: 'Wed', value: 9 },
    { label: 'Thu', value: 22 },
    { label: 'Fri', value: 15 },
  ],
  [
    { label: 'Q1', value: 45 },
    { label: 'Q2', value: 68 },
    { label: 'Q3', value: 52 },
    { label: 'Q4', value: 71 },
  ],
  [
    { label: 'A', value: 5 },
    { label: 'B', value: 15 },
    { label: 'C', value: 25 },
  ],
]

// Module-level preset lookup so the DashboardBuilderDemo template can
// reference them when .map() renders child components. Functions declared
// inside a component are not visible from the module-level template that
// runs when a new item is mounted.
function statPresetFor(id: number) {
  return STAT_PRESETS[id % STAT_PRESETS.length]
}

function chartPresetFor(id: number): ChartBar[] {
  return CHART_PRESETS[id % CHART_PRESETS.length]
}

function widgetSizeClass(size: WidgetSize): string {
  // Three distinct sizes on the 3-column grid (md+):
  //   SM: 1/3 width (col-span-1)
  //   MD: 2/3 width (col-span-2)
  //   LG: full row (col-span-3)
  if (size === 'sm') return 'md:col-span-1 min-h-[9rem]'
  if (size === 'lg') return 'md:col-span-3 min-h-[9rem]'
  return 'md:col-span-2 min-h-[9rem]'
}

function widgetSizeLabel(size: WidgetSize): string {
  return size.toUpperCase()
}

export function DashboardBuilderDemo() {
  const [widgets, setWidgets] = createSignal<WidgetConfig[]>(initialWidgets)

  // Layout memo: grid track count and gap density, reactive to widget count.
  // Widgets span 1/2/3 of the grid based on their size, so the grid must
  // expose up to 3 tracks for the LG widget to fill. Gap tightens as more
  // widgets pack into the same grid.
  const gridCols = createMemo(() => {
    const count = widgets().length
    if (count === 0) return 'grid-cols-1 gap-0'
    if (count <= 2) return 'grid-cols-1 md:grid-cols-3 gap-4'
    if (count <= 5) return 'grid-cols-1 md:grid-cols-3 gap-3'
    return 'grid-cols-1 md:grid-cols-3 gap-2'
  })

  // Memos derived from widgets() — demonstrate layout/config reactivity
  const widgetCount = createMemo(() => widgets().length)
  const statCount = createMemo(() => widgets().filter((w: WidgetConfig) => w.type === 'stat').length)
  const progressCount = createMemo(() => widgets().filter((w: WidgetConfig) => w.type === 'progress').length)
  const todoCount = createMemo(() => widgets().filter((w: WidgetConfig) => w.type === 'todo').length)
  const chartCount = createMemo(() => widgets().filter((w: WidgetConfig) => w.type === 'chart').length)

  // Actions
  const addWidget = (type: WidgetType) => {
    const titles: Record<WidgetType, string> = {
      stat: 'New Stat',
      progress: 'New Progress',
      todo: 'New Todo',
      chart: 'New Chart',
    }
    setWidgets((prev: WidgetConfig[]) => [...prev, {
      id: nextWidgetId(),
      type,
      title: titles[type],
      size: 'sm' as WidgetSize,
    }])
  }

  const removeWidget = (id: number) => {
    setWidgets((prev: WidgetConfig[]) => prev.filter((w: WidgetConfig) => w.id !== id))
  }

  const moveWidget = (id: number, dir: 'up' | 'down') => {
    setWidgets((prev: WidgetConfig[]) => {
      const idx = prev.findIndex((w: WidgetConfig) => w.id === id)
      if (idx === -1) return prev
      const newIdx = dir === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= prev.length) return prev
      const result = [...prev]
      const [moved] = result.splice(idx, 1)
      result.splice(newIdx, 0, moved)
      return result
    })
  }

  const cycleSize = (id: number) => {
    const order: WidgetSize[] = ['sm', 'md', 'lg']
    setWidgets((prev: WidgetConfig[]) => prev.map((w: WidgetConfig) => {
      if (w.id !== id) return w
      const i = order.indexOf(w.size)
      return { ...w, size: order[(i + 1) % order.length] }
    }))
  }

  const updateTitle = (id: number, title: string) => {
    setWidgets((prev: WidgetConfig[]) => prev.map((w: WidgetConfig) => w.id === id ? { ...w, title } : w))
  }

  return (
    <div className="dashboard-builder-demo w-full space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Dashboard Builder</h2>
          <Badge variant="secondary" className="widget-count">
            {widgetCount()} widgets
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="stat-count-badge">Stat: <span className="font-medium text-foreground">{statCount()}</span></span>
          <span>·</span>
          <span className="progress-count-badge">Progress: <span className="font-medium text-foreground">{progressCount()}</span></span>
          <span>·</span>
          <span className="todo-count-badge">Todo: <span className="font-medium text-foreground">{todoCount()}</span></span>
          <span>·</span>
          <span className="chart-count-badge">Chart: <span className="font-medium text-foreground">{chartCount()}</span></span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-2 rounded-lg border bg-card p-2">
        <span className="text-xs text-muted-foreground mr-1">Add:</span>
        <Button variant="outline" size="sm" className="add-stat-btn h-7 px-2 text-xs" onClick={() => addWidget('stat')}>
          + Stat
        </Button>
        <Button variant="outline" size="sm" className="add-progress-btn h-7 px-2 text-xs" onClick={() => addWidget('progress')}>
          + Progress
        </Button>
        <Button variant="outline" size="sm" className="add-todo-btn h-7 px-2 text-xs" onClick={() => addWidget('todo')}>
          + Todo
        </Button>
        <Button variant="outline" size="sm" className="add-chart-btn h-7 px-2 text-xs" onClick={() => addWidget('chart')}>
          + Chart
        </Button>
      </div>

      {/* Widget grid */}
      <div className={`dashboard-grid grid ${gridCols()}`}>
        {widgets().map((w: WidgetConfig) => (
          <div
            key={w.id}
            data-widget-type={w.type}
            data-widget-size={w.size}
            className={`widget-cell rounded-lg border bg-card p-3 flex flex-col gap-2 ${widgetSizeClass(w.size)}`}
          >
            {/* Widget header */}
            <div className="widget-header flex items-center flex-wrap gap-1.5">
              <span className="widget-type-badge inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                {WIDGET_LABELS[w.type]}
              </span>
              <input
                type="text"
                value={w.title}
                onInput={(e: any) => updateTitle(w.id, e.target.value)}
                className="widget-title-input flex-1 min-w-0 h-7 rounded-md border border-input bg-background px-2 text-sm font-medium"
                placeholder="Widget title"
              />
              <button
                type="button"
                className="widget-size-toggle inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-semibold hover:bg-accent shrink-0"
                onClick={() => cycleSize(w.id)}
                aria-label={`Size: ${w.size}`}
                title={`Size: ${w.size}`}
              >{widgetSizeLabel(w.size)}</button>
              <button
                type="button"
                className="widget-move-up inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent shrink-0"
                onClick={() => moveWidget(w.id, 'up')}
                aria-label="Move up"
              >↑</button>
              <button
                type="button"
                className="widget-move-down inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent shrink-0"
                onClick={() => moveWidget(w.id, 'down')}
                aria-label="Move down"
              >↓</button>
              <button
                type="button"
                className="widget-remove inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                onClick={() => removeWidget(w.id)}
                aria-label="Remove widget"
              >×</button>
            </div>

            {/* Widget body — dynamic component switching based on type */}
            <div className="widget-body flex-1">
              {w.type === 'stat' ? (
                <StatWidget
                  initialValue={statPresetFor(w.id).value}
                  step={statPresetFor(w.id).step}
                />
              ) : null}
              {w.type === 'progress' ? (
                <ProgressWidget initialProgress={35} />
              ) : null}
              {w.type === 'todo' ? (
                <TodoWidget />
              ) : null}
              {w.type === 'chart' ? (
                <ChartWidget initialBars={chartPresetFor(w.id)} />
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {widgetCount() === 0 ? (
        <div className="dashboard-empty rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <ArrowUpDownIcon className="w-5 h-5 opacity-50" />
            <p>No widgets yet. Add one from the toolbar above.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
