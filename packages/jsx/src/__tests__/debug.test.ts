/**
 * Debug analysis utilities tests.
 *
 * Verifies that `buildComponentGraph`, `traceUpdatePath`, and `generateStaticTrace`
 * correctly extract reactive dependency information from component IR.
 */

import { describe, test, expect } from 'bun:test'
import {
  buildComponentGraph,
  traceUpdatePath,
  formatComponentGraph,
  formatUpdatePath,
  formatSignalTrace,
  generateStaticTrace,
  graphToJSON,
} from '../debug'

const counterSource = `
  'use client'
  import { createSignal } from '@barefootjs/client-runtime'

  export function Counter() {
    const [count, setCount] = createSignal(0)
    return (
      <button onClick={() => setCount(n => n + 1)}>
        Count: {count()}
      </button>
    )
  }
`

const dashboardSource = `
  'use client'
  import { createSignal, createEffect, createMemo } from '@barefootjs/client-runtime'

  export function Dashboard() {
    const [count, setCount] = createSignal(0)
    const doubled = createMemo(() => count() * 2)
    createEffect(() => console.log(count()))
    return (
      <div>
        <span>{count()}</span>
        <span>{doubled()}</span>
        <button onClick={() => setCount(n => n + 1)}>+</button>
      </div>
    )
  }
`

// Component with dynamic attribute bindings (style, aria-*, class)
const sliderLikeSource = `
  'use client'
  import { createSignal, createMemo } from '@barefootjs/client-runtime'

  export function RangeInput() {
    const [value, setValue] = createSignal(50)
    const pct = createMemo(() => value() / 100)
    return (
      <div>
        <div style={\`width: \${pct()}%\`} />
        <span
          aria-valuenow={value()}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    )
  }
`

const todoSource = `
  'use client'
  import { createSignal, createMemo } from '@barefootjs/client-runtime'

  export function TodoList() {
    const [todos, setTodos] = createSignal([])
    const [filter, setFilter] = createSignal('all')
    const filteredTodos = createMemo(() => {
      const f = filter()
      return todos().filter(t => f === 'all' || t.status === f)
    })
    return (
      <div>
        <ul>{filteredTodos().map(t => <li>{t.text}</li>)}</ul>
      </div>
    )
  }
`

describe('buildComponentGraph', () => {
  test('extracts signals from a simple counter', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    expect(graph.componentName).toBe('Counter')
    expect(graph.signals).toHaveLength(1)
    expect(graph.signals[0].name).toBe('count')
    expect(graph.signals[0].setter).toBe('setCount')
    expect(graph.signals[0].initialValue).toBe('0')
  })

  test('extracts memos and effects', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    expect(graph.signals).toHaveLength(1)
    expect(graph.memos).toHaveLength(1)
    expect(graph.memos[0].name).toBe('doubled')
    expect(graph.memos[0].deps).toContain('count')
    expect(graph.effects).toHaveLength(1)
    expect(graph.effects[0].deps).toContain('count')
  })

  test('extracts DOM bindings for reactive text', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const textBindings = graph.domBindings.filter(d => d.type === 'text')
    expect(textBindings.length).toBeGreaterThanOrEqual(1)
    expect(textBindings[0].deps).toContain('count')
  })

  test('extracts event handler bindings', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const eventBindings = graph.domBindings.filter(d => d.type === 'event')
    expect(eventBindings.length).toBeGreaterThanOrEqual(1)
  })

  test('handles components with multiple signals and memos', () => {
    const graph = buildComponentGraph(todoSource, 'TodoList.tsx')
    expect(graph.signals).toHaveLength(2)
    expect(graph.memos).toHaveLength(1)
    expect(graph.memos[0].name).toBe('filteredTodos')
    expect(graph.memos[0].deps).toContain('todos')
    expect(graph.memos[0].deps).toContain('filter')
  })

  test('builds consumer lists for signals', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    const countSignal = graph.signals.find(s => s.name === 'count')!
    // count is consumed by memo:doubled and effect:e0
    expect(countSignal.consumers).toContain('memo:doubled')
    expect(countSignal.consumers).toContain('effect:e0')
  })

  test('extracts dynamic attribute bindings (style, aria-*)', () => {
    const graph = buildComponentGraph(sliderLikeSource, 'RangeInput.tsx')
    const attrBindings = graph.domBindings.filter(d => d.type === 'attribute')
    expect(attrBindings.length).toBeGreaterThanOrEqual(1)
    // style depends on the memo `pct`
    const styleBinding = attrBindings.find(d => d.label.includes('style'))
    expect(styleBinding).toBeDefined()
    expect(styleBinding!.deps).toContain('pct')
    // aria-valuenow depends on `value`
    const ariaBinding = attrBindings.find(d => d.label.includes('aria-valuenow'))
    expect(ariaBinding).toBeDefined()
    expect(ariaBinding!.deps).toContain('value')
  })

  test('includes attr bindings in memo consumer list', () => {
    const graph = buildComponentGraph(sliderLikeSource, 'RangeInput.tsx')
    const pct = graph.memos.find(m => m.name === 'pct')!
    expect(pct.consumers.some(c => c.includes('style'))).toBe(true)
  })

  test('returns empty graph for stateless component', () => {
    const source = `
      export function Card(props: { title: string }) {
        return <div className="card">{props.title}</div>
      }
    `
    const graph = buildComponentGraph(source, 'Card.tsx')
    expect(graph.componentName).toBe('Card')
    expect(graph.signals).toHaveLength(0)
    expect(graph.memos).toHaveLength(0)
    expect(graph.effects).toHaveLength(0)
  })
})

describe('traceUpdatePath', () => {
  test('traces signal to DOM updates', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const path = traceUpdatePath(graph, 'count')
    expect(path).not.toBeNull()
    expect(path!.target).toBe('count')
    expect(path!.kind).toBe('signal')
    expect(path!.dependents.length).toBeGreaterThan(0)
  })

  test('traces signal through memo to DOM', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    const path = traceUpdatePath(graph, 'count')
    expect(path).not.toBeNull()
    // count → memo:doubled → dom binding, and count → effect
    const memoEntry = path!.dependents.find(d => d.kind === 'memo')
    expect(memoEntry).toBeDefined()
    expect(memoEntry!.name).toBe('doubled')
  })

  test('traces memo directly', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    const path = traceUpdatePath(graph, 'doubled')
    expect(path).not.toBeNull()
    expect(path!.target).toBe('doubled')
    expect(path!.kind).toBe('memo')
  })

  test('returns null for unknown name', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const path = traceUpdatePath(graph, 'nonExistent')
    expect(path).toBeNull()
  })

  test('traces multiple dependencies for todo list', () => {
    const graph = buildComponentGraph(todoSource, 'TodoList.tsx')

    const todosPath = traceUpdatePath(graph, 'todos')
    expect(todosPath).not.toBeNull()
    // todos → filteredTodos (memo)
    const memoEntry = todosPath!.dependents.find(d => d.kind === 'memo')
    expect(memoEntry).toBeDefined()
    expect(memoEntry!.name).toBe('filteredTodos')

    const filterPath = traceUpdatePath(graph, 'filter')
    expect(filterPath).not.toBeNull()
    const filterMemoEntry = filterPath!.dependents.find(d => d.kind === 'memo')
    expect(filterMemoEntry).toBeDefined()
    expect(filterMemoEntry!.name).toBe('filteredTodos')
  })
})

describe('formatComponentGraph', () => {
  test('produces readable output', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const output = formatComponentGraph(graph)
    expect(output).toContain('Counter')
    expect(output).toContain('signals:')
    expect(output).toContain('count')
    expect(output).toContain('initial: 0')
  })

  test('includes dependency graph section', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    const output = formatComponentGraph(graph)
    expect(output).toContain('dependency graph:')
    expect(output).toContain('count -> memo:doubled')
  })
})

describe('formatUpdatePath', () => {
  test('produces readable output', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    const path = traceUpdatePath(graph, 'count')!
    const output = formatUpdatePath(path)
    expect(output).toContain('count (signal)')
    expect(output).toContain('doubled (memo)')
  })
})

describe('generateStaticTrace', () => {
  test('produces init entries for signals', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const trace = generateStaticTrace(graph)
    const initEntries = trace.filter(t => t.type === 'init')
    expect(initEntries.length).toBeGreaterThanOrEqual(1)
    expect(initEntries[0].signal).toBe('count')
    expect(initEntries[0].value).toBe('0')
  })

  test('produces render entry', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const trace = generateStaticTrace(graph)
    const renderEntries = trace.filter(t => t.type === 'render')
    expect(renderEntries).toHaveLength(1)
    expect(renderEntries[0].detail).toBe('initial')
  })

  test('produces effect entries', () => {
    const graph = buildComponentGraph(dashboardSource, 'Dashboard.tsx')
    const trace = generateStaticTrace(graph)
    const effectEntries = trace.filter(t => t.type === 'effect')
    expect(effectEntries.length).toBeGreaterThan(0)
  })

  test('format produces readable output', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const trace = generateStaticTrace(graph)
    const output = formatSignalTrace(trace)
    expect(output).toContain('[init] count = 0')
    expect(output).toContain('[render] initial')
  })
})

describe('graphToJSON', () => {
  test('produces valid JSON structure', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const json = graphToJSON(graph)
    expect(json).toHaveProperty('componentName', 'Counter')
    expect(json).toHaveProperty('signals')
    expect(json).toHaveProperty('memos')
    expect(json).toHaveProperty('effects')
    expect(json).toHaveProperty('domBindings')
  })
})
