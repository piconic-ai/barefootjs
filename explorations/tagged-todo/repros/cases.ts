/**
 * Minimal reproductions distilled from the TaggedTodoTable audit.
 * Each case: a tiny component source + a browser scenario (clicks +
 * what to inspect). Run with repro-runner.ts.
 */
export interface ReproCase {
  id: string
  /** What the case demonstrates. */
  claim: string
  source: string
  componentName: string
  /** CSS selectors to click after hydration, in order. */
  clicks: string[]
  /** Selector whose subtree is dumped before/after for inspection. */
  inspect: string
}

export const cases: ReproCase[] = [
  {
    id: 'r1a-flatmap-block-body',
    claim:
      'flatMap block body: hydration reconciles the SSR leaves against the UN-flattened source with index keys (item loss), and adding an item crashes on cloneNode(null) because the emitted template HTML is empty',
    componentName: 'R1a',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; tags: string[] }
export function R1a() {
  const [todos, setTodos] = createSignal<Item[]>([
    { id: 1, tags: ['a', 'b'] },
    { id: 2, tags: ['c', 'd'] },
  ])
  const add = () => setTodos([...todos(), { id: 9, tags: ['x'] }])
  return (
    <div>
      <button id="add" onClick={add}>add</button>
      <ul id="list">{todos().flatMap(t => {
        if (t.tags.length > 5) return []
        return t.tags.map(tag => <li key={\`\${t.id}:\${tag}\`}>{tag}</li>)
      })}</ul>
    </div>
  )
}
`,
    clicks: ['#add'],
    inspect: '#list',
  },
  {
    id: 'r1b-flatmap-expression-body',
    claim:
      'flatMap expression body returning JSX: raw JSX syntax leaks verbatim into the client bundle (no compile diagnostic) — the module is invalid JS, so the whole component fails to hydrate',
    componentName: 'R1b',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; tags: string[] }
export function R1b() {
  const [todos, setTodos] = createSignal<Item[]>([{ id: 1, tags: ['a', 'b'] }])
  const add = () => setTodos([...todos(), { id: 9, tags: ['x'] }])
  return (
    <div>
      <button id="add" onClick={add}>add</button>
      <ul id="list">{todos().flatMap(t => t.tags.map(tag => <li key={\`\${t.id}:\${tag}\`}>{tag}</li>))}</ul>
    </div>
  )
}
`,
    clicks: ['#add'],
    inspect: '#list',
  },
  {
    id: 'r2a-map-preamble-onclick',
    claim:
      'keyed .map() block body with an array-builder preamble + onClick: the delegated handler splices the preamble with getter-form item refs (t().name) onto the plain object find() returns — every row action throws "t is not a function"',
    componentName: 'R2a',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; name: string }
export function R2a() {
  const [items, setItems] = createSignal<Item[]>([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])
  const del = (id: number) => setItems(items().filter(i => i.id !== id))
  return <ul id="list">{items().map(t => {
    const cells = []
    cells.push(<span>{t.name}</span>)
    return <li key={t.id}>{cells}<button className="del" onClick={() => del(t.id)}>del</button></li>
  })}</ul>
}
`,
    clicks: ['#list li:nth-child(1) button.del'],
    inspect: '#list',
  },
  {
    id: 'r2b-map-simple-onclick-control',
    claim: 'CONTROL: same component without the preamble — row deletion works',
    componentName: 'R2b',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; name: string }
export function R2b() {
  const [items, setItems] = createSignal<Item[]>([{ id: 1, name: 'x' }, { id: 2, name: 'y' }])
  const del = (id: number) => setItems(items().filter(i => i.id !== id))
  return <ul id="list">{items().map(t => (
    <li key={t.id}>{t.name}<button className="del" onClick={() => del(t.id)}>del</button></li>
  ))}</ul>
}
`,
    clicks: ['#list li:nth-child(1) button.del'],
    inspect: '#list',
  },
  {
    id: 'r2c-map-const-preamble-onclick',
    claim:
      'const-only preamble: handler splices `const label = t.done ? …` BEFORE the `if (t)` guard — works when the row resolves, but dereferences t before the null check (latent TypeError)',
    componentName: 'R2c',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: number; name: string; done: boolean }
export function R2c() {
  const [items, setItems] = createSignal<Item[]>([{ id: 1, name: 'x', done: false }, { id: 2, name: 'y', done: true }])
  const del = (id: number) => setItems(items().filter(i => i.id !== id))
  return <ul id="list">{items().map(t => {
    const label = t.done ? 'done' : 'open'
    return <li key={t.id}>{label}<button className="del" onClick={() => del(t.id)}>del</button></li>
  })}</ul>
}
`,
    clicks: ['#list li:nth-child(1) button.del'],
    inspect: '#list',
  },
  {
    id: 'r3-string-key-quotes',
    claim:
      'keyed .map() whose key contains a double quote: the client renderItem interpolates data-key without escapeAttr (data-title right next to it IS escaped) — newly inserted rows get a truncated data-key plus a stray attribute',
    componentName: 'R3',
    source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Item = { id: string; name: string }
export function R3() {
  const [items, setItems] = createSignal<Item[]>([{ id: 'plain', name: 'x' }])
  const add = () => setItems([...items(), { id: 'q"uote', name: 'y' }])
  return (
    <div>
      <button id="add" onClick={add}>add</button>
      <ul id="list">{items().map(t => <li key={t.id} data-title={t.name}>{t.name}</li>)}</ul>
    </div>
  )
}
`,
    clicks: ['#add'],
    inspect: '#list',
  },
]
