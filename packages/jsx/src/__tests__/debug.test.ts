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
  import { createSignal } from '@barefootjs/client'

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
  import { createSignal, createEffect, createMemo } from '@barefootjs/client'

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
  import { createSignal, createMemo } from '@barefootjs/client'

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
  import { createSignal, createMemo } from '@barefootjs/client'

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

  test('domBindings entries carry classification', () => {
    // #944: JSON consumers (tooling, editor integrations) rely on the
    // classification field to filter fallbacks without re-running static
    // analysis. Guard against accidental regression in graphToJSON.
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const json = graphToJSON(graph) as { domBindings: Array<{ classification: string }> }
    expect(json.domBindings.length).toBeGreaterThan(0)
    for (const d of json.domBindings) {
      expect(d).toHaveProperty('classification')
      expect(['reactive', 'fallback']).toContain(d.classification)
    }
  })
})

// =============================================================================
// #944: classification — reactive vs fallback-wrapped DOM bindings
// =============================================================================

describe('DomBinding classification (#944)', () => {
  test('signal getter in text interpolation is reactive', () => {
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const textBindings = graph.domBindings.filter(d => d.type === 'text')
    expect(textBindings.length).toBeGreaterThan(0)
    for (const b of textBindings) {
      expect(b.classification).toBe('reactive')
      expect(b.deps).toContain('count')
    }
  })

  test('event handler is always reactive (not subject to wrap-by-default)', () => {
    // Handlers bind once; they aren't re-evaluated per signal change, so
    // the wrap-by-default gate doesn't apply. They should never show up
    // as fallback.
    const graph = buildComponentGraph(counterSource, 'Counter.tsx')
    const eventBindings = graph.domBindings.filter(d => d.type === 'event')
    expect(eventBindings.length).toBeGreaterThan(0)
    for (const b of eventBindings) {
      expect(b.classification).toBe('reactive')
    }
  })

  test('opaque call in text interpolation is fallback', () => {
    // `formatTitle(page)` is an imported helper; `page` is a local const.
    // Neither is a signal/memo/prop. #939 widened the emitter to wrap
    // these so the DOM updates match runtime reads; #944 surfaces them
    // here as `classification: 'fallback'` so users can find candidates.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle } from './format'

      export function Page() {
        const [, setFoo] = createSignal(0)
        const page = 'home'
        return <h1 onClick={() => setFoo(1)}>{formatTitle(page)}</h1>
      }
    `
    const graph = buildComponentGraph(source, 'Page.tsx')
    const text = graph.domBindings.find(d => d.type === 'text')
    expect(text).toBeDefined()
    expect(text!.classification).toBe('fallback')
    // Fallback bindings typically have empty deps — the effect subscribes
    // to whatever it happens to read at runtime, possibly nothing.
    expect(text!.deps).toEqual([])
  })

  test('opaque call in attribute is fallback', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { format } from './fmt'

      export function Tag() {
        const [, setFoo] = createSignal(0)
        const label = 'hi'
        return <button class={format(label)} onClick={() => setFoo(1)}>x</button>
      }
    `
    const graph = buildComponentGraph(source, 'Tag.tsx')
    const attr = graph.domBindings.find(d => d.type === 'attribute')
    expect(attr).toBeDefined()
    expect(attr!.classification).toBe('fallback')
    expect(attr!.label).toBe('class')
  })

  test('opaque call in conditional is fallback', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { shouldShow } from './rules'

      export function Panel() {
        const [, setFoo] = createSignal(0)
        const mode = 'draft'
        return <div onClick={() => setFoo(1)}>{shouldShow(mode) ? <span>on</span> : <span>off</span>}</div>
      }
    `
    const graph = buildComponentGraph(source, 'Panel.tsx')
    const cond = graph.domBindings.find(d => d.type === 'conditional')
    expect(cond).toBeDefined()
    expect(cond!.classification).toBe('fallback')
  })

  test('opaque call producing loop array is fallback', () => {
    // `getItems()` is an imported helper — the analyzer can't prove it
    // reactive, but it has calls so the emitter routes it through
    // `!isStaticArray` (mapArray) to match runtime reads. #944 marks it
    // as fallback so users can find the candidate for refactor.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { getItems } from './items'

      export function List() {
        const [, setFoo] = createSignal(0)
        return (
          <ul onClick={() => setFoo(1)}>
            {getItems().map(item => <li>{item}</li>)}
          </ul>
        )
      }
    `
    const graph = buildComponentGraph(source, 'List.tsx')
    const loop = graph.domBindings.find(d => d.type === 'loop')
    expect(loop).toBeDefined()
    expect(loop!.classification).toBe('fallback')
  })

  test('signal-driven loop array is reactive', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function List() {
        const [items, setItems] = createSignal([1, 2, 3])
        return (
          <ul onClick={() => setItems(i => [...i, i.length])}>
            {items().map(item => <li>{item}</li>)}
          </ul>
        )
      }
    `
    const graph = buildComponentGraph(source, 'List.tsx')
    const loop = graph.domBindings.find(d => d.type === 'loop')
    expect(loop).toBeDefined()
    expect(loop!.classification).toBe('reactive')
    expect(loop!.deps).toContain('items')
  })

  test('opaque call in child-component prop is fallback (#944 concern 1)', () => {
    // `<Card title={formatTitle(page)} />` — the #942 motivating example.
    // The child-prop emitter wraps this in a reactive child-prop entry via
    // `prop.callsReactiveGetters || prop.hasFunctionCalls`, but before the
    // review fix `collectDomBindings` had no `case 'component'` branch, so
    // the binding silently missed the graph — under-reporting in a CLI
    // whose purpose is to surface exactly these.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle } from './format'
      import { Card } from './Card'

      export function Dashboard() {
        const [, setFoo] = createSignal(0)
        const page = 'home'
        return (
          <div onClick={() => setFoo(1)}>
            <Card title={formatTitle(page)} />
          </div>
        )
      }
    `
    const graph = buildComponentGraph(source, 'Dashboard.tsx')
    const cardProp = graph.domBindings.find(d => d.label === 'Card.title')
    expect(cardProp).toBeDefined()
    expect(cardProp!.classification).toBe('fallback')
    expect(cardProp!.type).toBe('attribute')
    expect(cardProp!.expression).toBe('formatTitle(page)')
  })

  test('props.xxx in child-component prop is reactive (#944 concern 1)', () => {
    // The `hasPropsRef` branch in the emitter gate — direct `props.title`
    // read is reactive, not fallback. Guard the debug-side approximation
    // (`propValue.includes('props.')`) so this case doesn't get demoted
    // to fallback by accident.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Card } from './Card'

      export function Dashboard(props: { title: string }) {
        const [, setFoo] = createSignal(0)
        return (
          <div onClick={() => setFoo(1)}>
            <Card title={props.title} />
          </div>
        )
      }
    `
    const graph = buildComponentGraph(source, 'Dashboard.tsx')
    const cardProp = graph.domBindings.find(d => d.label === 'Card.title')
    expect(cardProp).toBeDefined()
    expect(cardProp!.classification).toBe('reactive')
  })

  test('fallback inside child-component subtree is still collected (#944 concern 1)', () => {
    // The previous silent-fall-through also skipped recursion into
    // `node.children`, so any fallback reached only through a component
    // subtree was doubly invisible. Pin the recursion.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle } from './format'
      import { Dialog } from './Dialog'

      export function Page() {
        const [, setFoo] = createSignal(0)
        const page = 'home'
        return (
          <Dialog>
            <h1 onClick={() => setFoo(1)}>{formatTitle(page)}</h1>
          </Dialog>
        )
      }
    `
    const graph = buildComponentGraph(source, 'Page.tsx')
    const text = graph.domBindings.find(d => d.type === 'text')
    expect(text).toBeDefined()
    expect(text!.classification).toBe('fallback')
  })

  test('domBindings carry expression text for non-event sites (#944 concern 2)', () => {
    // why-wrap relies on the expression field to print something a human
    // can locate in source. Pin the field on every non-event site so the
    // CLI output doesn't silently degrade to slotId-only labels.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle, getStyle, shouldShow, getItems } from './helpers'
      import { Card } from './Card'

      export function Everything() {
        const [, setFoo] = createSignal(0)
        const mode = 'draft'
        return (
          <div onClick={() => setFoo(1)}>
            <h1 style={getStyle(mode)}>{formatTitle(mode)}</h1>
            {shouldShow(mode) ? <span>on</span> : <span>off</span>}
            <ul>{getItems().map(i => <li>{i}</li>)}</ul>
            <Card title={formatTitle(mode)} />
          </div>
        )
      }
    `
    const graph = buildComponentGraph(source, 'Everything.tsx')
    const byType = (t: string) => graph.domBindings.filter(d => d.type === t)
    const text = byType('text').find(d => d.classification === 'fallback')
    const attr = byType('attribute').find(d => d.classification === 'fallback' && d.label === 'style')
    const cond = byType('conditional').find(d => d.classification === 'fallback')
    const loop = byType('loop').find(d => d.classification === 'fallback')
    const childProp = graph.domBindings.find(d => d.label === 'Card.title')
    expect(text?.expression).toContain('formatTitle')
    expect(attr?.expression).toContain('getStyle')
    expect(cond?.expression).toContain('shouldShow')
    expect(loop?.expression).toContain('getItems')
    expect(childProp?.expression).toContain('formatTitle')
    // Event handlers: no expression field — rationale in DomBinding doc.
    const event = graph.domBindings.find(d => d.type === 'event')
    expect(event).toBeDefined()
    expect(event!.expression).toBeUndefined()
  })

  test('formatComponentGraph marks fallback bindings with ~ prefix', () => {
    // The visual marker is the primary UX for `barefoot inspect`.
    // Guard the prefix format so `why-wrap` output doesn't silently drift.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle } from './format'

      export function Page() {
        const [count, setCount] = createSignal(0)
        const page = 'home'
        return <h1 onClick={() => setCount(c => c + 1)}>{formatTitle(page)} {count()}</h1>
      }
    `
    const graph = buildComponentGraph(source, 'Page.tsx')
    const output = formatComponentGraph(graph)
    // Fallback text binding for formatTitle(page) — marked with '~'.
    expect(output).toMatch(/~ text "/)
    // Reactive text binding for count() — marked with two leading spaces
    // (no tilde). The exact prefix matters: it's the visual diff.
    expect(output).toMatch(/dom bindings:[\s\S]*?text "/)
    // No fallback marker on the reactive binding's line.
    const lines = output.split('\n')
    const countLine = lines.find(l => l.includes('count') && l.includes('text'))
    expect(countLine).toBeDefined()
    expect(countLine!).not.toMatch(/~ text/)
  })
})
