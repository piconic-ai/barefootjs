/**
 * CSR template scope soundness (#2468 / adapter-tests scope-gate holes).
 *
 * The `hydrate('X', { template: (_p) => ... })` lambda runs at module
 * scope, so every identifier it references must be either `_p`, a
 * template-local binding, or a global. These tests pin the three
 * emission paths that leaked init-scoped bindings into the lambda
 * (each one a guaranteed `ReferenceError` on CSR mount):
 *
 *  A. a memo body inlined into the template kept its bare destructured
 *     prop refs (`(value * 10)` instead of `(_p.value * 10)`);
 *  B. a component prop carrying a template literal over a destructured
 *     prop rendered into `renderChild(...)` un-rewritten
 *     (`${className}` instead of `${_p.className}`);
 *  C. a getter-elided signal (`const [, setActive] = createSignal(0)`)
 *     was dropped from init entirely while its setter stayed referenced
 *     by the emitted handler.
 *
 *  D. a component prop whose value is (or contains) a BARE — uncalled —
 *     reference to a local signal/memo getter (`<Display value={count} />`,
 *     #2924) kept the bare source-level name in the `renderChild(...)`
 *     props literal instead of substituting a thunk over its value.
 *  E. the setter-symmetric case (`<Display update={setCount} />`, #2924):
 *     a bare reference to a signal SETTER hit the identical gap — no
 *     substitution entry existed for the setter's name at all.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function clientJsOf(source: string): string {
  const result = compileJSX(source, 'scope-soundness.tsx', { adapter: new HonoAdapter() })
  const errors = result.errors.filter(e => e.severity === 'error')
  expect(errors).toEqual([])
  const clientJs = result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n')
  expect(clientJs).not.toBe('')
  return clientJs
}

/** The registration template lambda's source, extracted per component. */
function templateLambdaOf(clientJs: string, name: string): string {
  const start = clientJs.indexOf(`hydrate('${name}'`)
  expect(start).toBeGreaterThan(-1)
  const end = clientJs.indexOf('\n', start)
  return clientJs.slice(start, end === -1 ? undefined : end)
}

describe('CSR template scope soundness (#2468)', () => {
  test('A: memo body inlined into the template rewrites destructured prop refs to _p.*', () => {
    const clientJs = clientJsOf(`
"use client"
import { createMemo } from '@barefootjs/client'

export function Derived({ value }: { value: number }) {
  const doubled = createMemo(() => value * 10)
  return <span>{doubled()}</span>
}
`)
    const template = templateLambdaOf(clientJs, 'Derived')
    expect(template).toContain('_p.value * 10')
    expect(template).not.toMatch(/[^.\w]value \* 10/)
  })

  test('B: component-prop template literal rewrites destructured prop refs to _p.*', () => {
    const clientJs = clientJsOf(`
"use client"
import { Slot } from './slot'

const base = 'chip'

interface BaseProps { className?: string }
interface ChipProps extends BaseProps { asChild?: boolean; children?: unknown }

export function Chip({ className = '', asChild = false, children, ...props }: ChipProps) {
  const classes = \`\${base} \${className}\`
  if (asChild) {
    return <Slot className={classes} {...props}>{children}</Slot>
  }
  return <span class={classes} {...props}>{children}</span>
}
`)
    const template = templateLambdaOf(clientJs, 'Chip')
    // The renderChild props object must read the prop off _p, exactly
    // like the sibling element attribute already does.
    expect(template).not.toMatch(/\$\{className\}/)
    expect(template).toContain('_p.className')
  })

  test('C: a getter-elided signal declaration still lands in init', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

export function Fire() {
  const [, setFlag] = createSignal(0)
  return <button onClick={() => setFlag(1)}>go</button>
}
`)
    // The setter is referenced by the click handler, so its declaring
    // statement must exist in the emitted init.
    expect(clientJs).toMatch(/setFlag\s*\]\s*=\s*createSignal\(0\)/)
  })

  test('D: a bare signal getter passed as a component prop substitutes a thunk in the template', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

function Display(props: { value: () => number }) {
  return <span class="value">{props.value()}</span>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  return (
    <div class="root">
      <Display value={count} />
    </div>
  )
}
`)
    const template = templateLambdaOf(clientJs, 'Counter')
    expect(template).toContain('value: (() => (5))')
    expect(template).not.toMatch(/value:\s*count\b/)
  })

  test('D: a bare memo getter passed as a component prop substitutes a thunk over its computation', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal, createMemo } from '@barefootjs/client'

function Display(props: { value: () => number }) {
  return <span class="value">{props.value()}</span>
}

export function Counter() {
  const [count] = createSignal(5)
  const doubled = createMemo(() => count() * 2)
  return (
    <div class="root">
      <Display value={doubled} />
    </div>
  )
}
`)
    const template = templateLambdaOf(clientJs, 'Counter')
    expect(template).toContain('value: (() => ((5) * 2))')
    expect(template).not.toMatch(/value:\s*doubled\b/)
  })

  test('D: a bare getter wrapped in an object literal prop also substitutes a thunk (Context-Provider idiom)', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

function Display(props: { value: { v: () => number } }) {
  return <span class="value">{props.value.v()}</span>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  return (
    <div class="root">
      <Display value={{ v: count }} />
    </div>
  )
}
`)
    const template = templateLambdaOf(clientJs, 'Counter')
    expect(template).toContain('{ v: (() => (5)) }')
    expect(template).not.toMatch(/\{\s*v:\s*count\s*\}/)
  })

  test('D: a getter-only const alias (e.g. `const c2 = count`) inlines the same thunk, not a deferred placeholder', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

function Display(props: { value: () => number }) {
  return <span class="value">{props.value()}</span>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  const c2 = count
  return (
    <div class="root">
      <Display value={c2} />
    </div>
  )
}
`)
    const template = templateLambdaOf(clientJs, 'Counter')
    expect(template).toContain('value: (() => (5))')
    expect(template).not.toContain('data-bf-ph')
  })

  test('E: a bare signal setter passed as a component prop substitutes the SSR noop shim', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

function Display(props: { update: () => void }) {
  return <button onClick={() => props.update()}>go</button>
}

export function Counter() {
  const [count, setCount] = createSignal(5)
  return (
    <div class="root">
      <Display update={setCount} />
    </div>
  )
}
`)
    const template = templateLambdaOf(clientJs, 'Counter')
    expect(template).toContain('update: (() => {})')
    expect(template).not.toMatch(/update:\s*setCount\b/)
  })
})

/**
 * Scope-aware prop rewrite (#2482 audit): `rewriteBarePropRefs` must
 * not touch a name where a binding INSIDE the expression shadows the
 * prop — a nested callback's parameter above all. The pre-fix global
 * word-boundary regex rewrote the parameter declaration itself,
 * emitting `.map((_p.title) => _p.title.a)`: a parse error that killed
 * the whole client bundle.
 */
describe('scope-aware prop rewrite (nested callback param sharing a prop name)', () => {
  test('memo computation keeps the callback param bare', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal, createMemo } from '@barefootjs/client'

export function Titles({ title }: { title: string }) {
  const [items, setItems] = createSignal([{ a: 'x' }])
  const joined = createMemo(() => items().map((title) => title.a).join(','))
  return <div><span>{joined()}</span><button onClick={() => setItems([])}>x</button></div>
}
`)
    expect(clientJs).not.toMatch(/\(\s*_p\.title\s*\)\s*=>/)
    expect(clientJs).not.toMatch(/_p\.title\.a/)
  })

  test('signal initializer keeps the callback param bare', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal } from '@barefootjs/client'

export function Titles({ title }: { title: string }) {
  const [joined, setJoined] = createSignal([{ a: 'x' }].map((title) => title.a).join(','))
  return <div><span>{joined()}</span><button onClick={() => setJoined('')}>x</button></div>
}
`)
    expect(clientJs).not.toMatch(/\(\s*_p\.title\s*\)\s*=>/)
  })

  test('mixed usage rewrites exactly the genuine outer reference', () => {
    const clientJs = clientJsOf(`
"use client"
import { createSignal, createMemo } from '@barefootjs/client'

export function Titles({ title }: { title: string }) {
  const [items, setItems] = createSignal([{ a: 'x' }])
  const label = createMemo(() => title + ':' + items().map((title) => title.a).join(','))
  return <div><span>{label()}</span><button onClick={() => setItems([])}>x</button></div>
}
`)
    const template = templateLambdaOf(clientJs, 'Titles')
    // outer ref rewritten…
    expect(template).toContain('_p.title +')
    // …inner param and its references untouched
    expect(template).toMatch(/\(\s*title\s*\)\s*=>\s*title\.a/)
    expect(template).not.toMatch(/\(\s*_p\.title\s*\)\s*=>/)
  })

  test('a loop-shadowed record const is not folded into a template span', () => {
    const clientJs = clientJsOf(`
const tone = { a: 'outer-a', b: 'outer-b' }

export function Tones({ items, k }: { items: { id: number; a: string; b: string }[]; k: string }) {
  return <ul>{items.map((tone) => <li key={tone.id} data-t={\`t \${tone[k]}\`}>{tone.a}</li>)}</ul>
}
`)
    const template = templateLambdaOf(clientJs, 'Tones')
    // The span must read the row binding, not the outer record literal.
    expect(template).toContain('tone[_p.k]')
    expect(template).not.toContain('outer-a')
  })
})
