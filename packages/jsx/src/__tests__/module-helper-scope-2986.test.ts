/**
 * Module-level helper functions referenced from a component (#2986).
 *
 * `visit()`'s module-level walk used to descend into the body of a
 * module-level `const f = (…) => { … }` and collect that body's inner
 * `const`/`function` declarations as if they were declarations of the
 * FILE itself — hoisted into both the component's init function and the
 * marked template, where their references to the helper's own
 * parameters are unbound. The `function f(…) { … }` declaration form was
 * immune (the module-level branch `return`s right after collecting it,
 * so it is never walked into) — that asymmetry is what the issue
 * reported as "function vs const arrow" being inlined differently.
 *
 * Pre-fix, the leaked inner declaration appeared TWICE in the emitted
 * client JS: once (broken — unbound param refs) hoisted to the top of
 * init, and once more correctly inside the helper's own body. Every
 * "does not leak" assertion below therefore checks the occurrence COUNT
 * of the inner statement, not just its presence — a bare `.toContain`
 * would pass on both the broken and the fixed output.
 *
 * Every parity case asserts that the `const` arrow form and the
 * `function` declaration form agree — that agreement is the property
 * whose absence produced the bug, and the guard this test protects
 * (`isFunctionScope`, `analyzer.ts`) is now the single shared answer to
 * "does this node open a new function scope?" for both the module-level
 * walk (`visit`) and the component-body walk (`visitComponentBody`).
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

function compile(source: string) {
  const result = compileJSX(source, 'ModuleHelper.tsx', { adapter: new HonoAdapter() })
  const clientJs = result.files.find(f => f.type === 'clientJs')?.content ?? ''
  const markedTemplate = result.files.find(f => f.type === 'markedTemplate')?.content ?? ''
  return { result, clientJs, markedTemplate }
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
}

describe('module-level helper functions (#2986)', () => {
  test('sync block-bodied helper: inner declaration stays inside the helper, not hoisted into init', () => {
    const { result, clientJs, markedTemplate } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
const score = (title: string, term: string): number => {
  const t = title.toLowerCase()
  return t.includes(term) ? 1 : 0
}
export function Search() {
  const [term, setTerm] = createSignal('')
  return <div onClick={() => setTerm('x')}>{score('hello', term())}</div>
}
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    // Pre-fix this line was duplicated: once (broken) at the top of init
    // and once inside `score`'s own body. It must appear exactly once.
    expect(countOccurrences(clientJs, 'const t = title.toLowerCase()')).toBe(1)
    expect(clientJs).toContain('const score = (title, term) => {')
    // The Hono reference adapter's marked template is TSX source rendered
    // through the JSX runtime, so it legitimately contains the helper
    // once, correctly scoped — pre-fix it was duplicated here too.
    expect(countOccurrences(markedTemplate, 'const t = title.toLowerCase()')).toBe(1)
  })

  test('async helper: no top-level-of-init await, async wrapper intact, no bare await in the template', () => {
    const { result, clientJs, markedTemplate } = compile(`
'use client'
import { createSignal, onMount } from '@barefootjs/client'
const loadData = async (): Promise<string[]> => {
  const res = await fetch('/data.json')
  return res.json()
}
function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  onMount(() => { void loadData().then(setItems) })
  return <div>{items().length}</div>
}
export default Widget
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    expect(countOccurrences(clientJs, "await fetch('/data.json')")).toBe(1)
    expect(clientJs).toContain('const loadData = async () => {')
    // Same reasoning as the sync case: the reference adapter's marked
    // template is TSX source, so `loadData` legitimately appears once,
    // correctly scoped — pre-fix its inner `await` was duplicated here.
    expect(countOccurrences(markedTemplate, "await fetch('/data.json')")).toBe(1)
  })

  test('object-literal property arrow: an async method on a module-level object const does not leak', () => {
    const { result, clientJs } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
const api = {
  load: async () => {
    const res = await fetch('/data.json')
    return res.json()
  },
}
export function Widget() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => { void api.load(); setCount(count() + 1) }}>{count()}</button>
}
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    expect(countOccurrences(clientJs, "await fetch('/data.json')")).toBe(1)
  })

  test('nested function inside a module arrow does not escape to module scope', () => {
    const { result, clientJs } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
const outer = (v: number) => {
  function inner(q: number) { return q + v }
  return inner(1)
}
export function Widget() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(outer(count()))}>{count()}</button>
}
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    expect(clientJs).not.toMatch(/var inner = inner \?\?/)
  })

  test('factory arrow containing createSignal: no false BF011 (SIGNAL_OUTSIDE_COMPONENT)', () => {
    const { result } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
const mk = () => {
  const [a, setA] = createSignal(0)
  return a
}
export function Widget() {
  const a = mk()
  return <div>{a()}</div>
}
`)
    expect(result.errors.filter(e => e.code === 'BF011')).toEqual([])
  })

  test('component-body object method: an inline method on a component-local const does not leak into init', () => {
    const { result, clientJs } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Widget() {
  const [count, setCount] = createSignal(0)
  const api = {
    load() {
      const r = 1
      return r
    },
  }
  return <button onClick={() => setCount(count() + api.load())}>{count()}</button>
}
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    expect(countOccurrences(clientJs, 'const r = 1')).toBe(1)
  })

  test('guard: a component-body async function declaration referencing component scope still lowers to an async arrow in init', () => {
    const { result, clientJs } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
export function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  async function fetchItems() {
    const res = await fetch('/data.json')
    setItems(await res.json())
  }
  return <button onClick={() => fetchItems()}>{items().length}</button>
}
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    // References `setItems` (component scope), so `compute-scope`'s
    // fixpoint must demote it to init scope, same as the #1130 pin.
    expect(clientJs).toMatch(/const\s+fetchItems\s*=\s*async\s*\(/)
  })

  test('guard: a module-level async helper with no component-scope references is safely promoted to module scope', () => {
    const { result, clientJs } = compile(`
'use client'
import { createSignal, onMount } from '@barefootjs/client'
export function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  async function fetchItems() {
    const res = await fetch('/data.json')
    return res.json()
  }
  onMount(() => { void fetchItems().then(setItems) })
  return <div>{items().length}</div>
}
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    // `fetchItems` closes over nothing component-scoped, so it is free to
    // live at true module scope; it must still be a valid, complete async
    // function exactly once (not leaked/duplicated into init).
    expect(countOccurrences(clientJs, "await fetch('/data.json')")).toBe(1)
  })

  test('guard: an arrow component still collects a function declared inside its own body', () => {
    const { result, clientJs } = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
const Widget = () => {
  function helper(n: number) { return n * 2 }
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(helper(count()))}>{count()}</button>
}
export default Widget
`)
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    expect(clientJs).toContain('helper')
  })

  describe('parity between the `const` arrow form and the `function` declaration form', () => {
    test('sync block-bodied helper: neither form duplicates the inner statement', () => {
      const arrowForm = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
const score = (title: string, term: string): number => {
  const t = title.toLowerCase()
  return t.includes(term) ? 1 : 0
}
export function Search() {
  const [term, setTerm] = createSignal('')
  return <div onClick={() => setTerm('x')}>{score('hello', term())}</div>
}
`)
      const functionForm = compile(`
'use client'
import { createSignal } from '@barefootjs/client'
function score(title: string, term: string): number {
  const t = title.toLowerCase()
  return t.includes(term) ? 1 : 0
}
export function Search() {
  const [term, setTerm] = createSignal('')
  return <div onClick={() => setTerm('x')}>{score('hello', term())}</div>
}
`)
      expect(arrowForm.result.errors.filter(e => e.severity === 'error')).toEqual([])
      expect(functionForm.result.errors.filter(e => e.severity === 'error')).toEqual([])
      expect(countOccurrences(arrowForm.clientJs, 'const t = title.toLowerCase()')).toBe(1)
      expect(countOccurrences(functionForm.clientJs, 'const t = title.toLowerCase()')).toBe(1)
    })

    test('async helper: neither form duplicates the inner await', () => {
      const arrowForm = compile(`
'use client'
import { createSignal, onMount } from '@barefootjs/client'
const loadData = async (): Promise<string[]> => {
  const res = await fetch('/data.json')
  return res.json()
}
function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  onMount(() => { void loadData().then(setItems) })
  return <div>{items().length}</div>
}
export default Widget
`)
      const functionForm = compile(`
'use client'
import { createSignal, onMount } from '@barefootjs/client'
async function loadData(): Promise<string[]> {
  const res = await fetch('/data.json')
  return res.json()
}
function Widget() {
  const [items, setItems] = createSignal<string[]>([])
  onMount(() => { void loadData().then(setItems) })
  return <div>{items().length}</div>
}
export default Widget
`)
      expect(arrowForm.result.errors.filter(e => e.severity === 'error')).toEqual([])
      expect(functionForm.result.errors.filter(e => e.severity === 'error')).toEqual([])
      expect(countOccurrences(arrowForm.clientJs, "await fetch('/data.json')")).toBe(1)
      expect(countOccurrences(functionForm.clientJs, "await fetch('/data.json')")).toBe(1)
    })
  })
})
