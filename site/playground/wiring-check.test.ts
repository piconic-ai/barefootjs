/**
 * Unit tests for the reactive-WIRING check (build/wiring-check.ts) — the
 * detection layer that runs in the browser compile worker via compileAppCore.
 *
 * Pins the contract that matters: a no-initial-value signal is FLAGGED (the
 * classic AI \`.map()\` crash) while every legitimate initial — list, text,
 * number, boolean false, object, prop-derived — is NOT (no false positives).
 * The detection reuses \`@barefootjs/jsx\`'s buildComponentGraph, so these tests
 * also guard against analyzer-output drift breaking the empty-initial signal.
 *
 * Run: `bun test site/playground/wiring-check.test.ts`
 */

import { describe, expect, test } from 'bun:test'
import {
  checkComponentWiring,
  checkAppWiring,
  formatWiringIssues,
  WiringIssuesError,
} from './build/wiring-check'

describe('no-initial-value signal detection', () => {
  test('flags a list signal with no initial value rendered with .map()', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function Todos() {
  const [todos, setTodos] = createSignal<string[]>()
  return <ul>{todos().map((t) => <li>{t}</li>)}</ul>
}`
    const issues = checkComponentWiring(src, 'src/Todos.tsx')
    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('src/Todos.tsx')
    expect(issues[0].component).toBe('Todos')
    // Loop-fed signals get the array-specific fix.
    expect(issues[0].message).toContain('todos')
    expect(issues[0].message).toContain('.map()')
    expect(issues[0].message).toContain('[]')
  })

  test('flags a non-list no-initial signal with generic guidance', () => {
    const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function Greeting() {
  const [name, setName] = createSignal<string>()
  return <p>{name()}</p>
}`
    const issues = checkComponentWiring(src, 'src/Greeting.tsx')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('name')
    expect(issues[0].message).toContain('no initial value')
  })
})

describe('no false positives on legitimate initials', () => {
  const good: Array<[string, string]> = [
    ['empty array', `const [xs, setXs] = createSignal<string[]>([])`],
    ['empty string', `const [t, setT] = createSignal('')`],
    ['number zero', `const [n, setN] = createSignal(0)`],
    ['boolean false', `const [on, setOn] = createSignal(false)`],
    ['object', `const [o, setO] = createSignal({ a: 1 })`],
    ['prop-derived', `const [n, setN] = createSignal(props.initial ?? 0)`],
  ]
  for (const [label, decl] of good) {
    test(`does not flag ${label}`, () => {
      const src = `'use client'
import { createSignal } from '@barefootjs/client'
export function C(props: { initial?: number }) {
  ${decl}
  return <button onClick={() => setN ? setN(1) : null}>ok</button>
}`
      // (the handler just keeps the signal "used"; the assertion is about the
      // initial value, not the handler)
      const issues = checkComponentWiring(src, 'src/C.tsx')
      expect(issues).toHaveLength(0)
    })
  }

  test('does not flag a clean counter or todo app', () => {
    const counter = `'use client'
import { createSignal, createMemo } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)
  return <button onClick={() => setCount((n) => n + 1)}>{count()} {doubled()}</button>
}`
    expect(checkComponentWiring(counter, 'src/Counter.tsx')).toHaveLength(0)

    const todo = `'use client'
import { createSignal } from '@barefootjs/client'
export function Todo() {
  const [items, setItems] = createSignal<string[]>([])
  const [text, setText] = createSignal('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); setItems([...items(), text()]); setText('') }}>
      <input value={text()} onInput={(e) => setText(e.target.value)} />
      <ul>{items().map((it) => <li>{it}</li>)}</ul>
    </form>
  )
}`
    expect(checkComponentWiring(todo, 'src/Todo.tsx')).toHaveLength(0)
  })
})

describe('handlers that call no local setter are NOT flagged (skipped check)', () => {
  // The "dead handler" check is deliberately NOT implemented (false-positive
  // prone). A handler calling a parent callback or doing navigation is valid.
  test('a button calling a parent prop callback is clean', () => {
    const src = `'use client'
export function Item(props: { onRemove: () => void }) {
  return <button onClick={() => props.onRemove()}>x</button>
}`
    expect(checkComponentWiring(src, 'src/Item.tsx')).toHaveLength(0)
  })
})

describe('checkAppWiring + formatWiringIssues', () => {
  test('scans only src/*.tsx and aggregates issues', () => {
    const files = {
      'server.tsx': `import { Hono } from 'hono'\nconst app = new Hono()\nexport default app`,
      'src/Todos.tsx': `'use client'
import { createSignal } from '@barefootjs/client'
export function Todos() {
  const [todos, setTodos] = createSignal<string[]>()
  return <ul>{todos().map((t) => <li>{t}</li>)}</ul>
}`,
      'src/Home.tsx': `export function Home() { return <h1>Home</h1> }`,
    }
    const issues = checkAppWiring(files)
    expect(issues).toHaveLength(1)
    expect(issues[0].path).toBe('src/Todos.tsx')
  })

  test('formatWiringIssues prefixes each line with the file path', () => {
    const out = formatWiringIssues([
      { path: 'src/A.tsx', component: 'A', message: 'signal "x" has no initial value' },
      { path: 'src/B.tsx', component: 'B', message: 'signal "y" has no initial value' },
    ])
    expect(out).toBe(
      'src/A.tsx: signal "x" has no initial value\n' +
        'src/B.tsx: signal "y" has no initial value',
    )
  })

  test('WiringIssuesError carries the structured issues + a readable message', () => {
    const issues = [
      { path: 'src/A.tsx', component: 'A', message: 'signal "x" has no initial value' },
    ]
    const err = new WiringIssuesError(issues)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('WiringIssuesError')
    expect(err.issues).toBe(issues)
    expect(err.message).toContain('src/A.tsx')
    expect(err.message).toContain('no initial value')
  })

  test('a clean app produces no issues', () => {
    const files = {
      'src/Counter.tsx': `'use client'
import { createSignal } from '@barefootjs/client'
export function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount((n) => n + 1)}>{count()}</button>
}`,
    }
    expect(checkAppWiring(files)).toHaveLength(0)
  })
})
