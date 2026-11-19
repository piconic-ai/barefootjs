/**
 * `checkStatementWrites` (#3719): a binding a component-body statement
 * writes after its declaration is refused (BF101) where the compiled output
 * would read it as it was declared while JS reads the written value — a
 * server read evaluated after the write, or an init-time read declared after
 * the statement — and compiles everywhere else.
 */
import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../index.ts'
import { TestAdapter } from '../adapters/test-adapter.ts'
import type { CompilerError } from '../types.ts'

const CLIENT = `'use client'\nimport { createMemo, createSignal } from '@barefootjs/client'\n`

function errorsOf(source: string): CompilerError[] {
  return compileJSX(source, 'c.tsx', { adapter: new TestAdapter() }).errors.filter(e => e.severity === 'error')
}

function refusals(source: string): CompilerError[] {
  return errorsOf(source).filter(e => e.code === 'BF101' && e.message.includes('a statement in the component body'))
}

function escapeKinds(error: CompilerError | undefined): string[] {
  return (error?.suggestion?.escape ?? []).map(e => e.kind)
}

describe('#3719: a server read of a binding a body statement writes', () => {
  const refused: Record<string, string> = {
    'an in-place mutation read as text': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <p>{local.length}</p>
}`,
    'a read in an attribute': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <p data-n={local.length}>t</p>
}`,
    'a read in a condition': `${CLIENT}export function C() {
  const local: string[] = []
  local.push('z')
  return <p>{local.length > 0 ? <b>some</b> : <i>none</i>}</p>
}`,
    'a read as a loop array': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <ul>{local.map(x => <li key={x}>{x}</li>)}</ul>
}`,
    'a let a loop reassigns': `${CLIENT}export function C() {
  let label = 'a'
  for (const x of ['b', 'c']) label += x
  return <p class={label}>t</p>
}`,
    'a property write': `${CLIENT}export function C() {
  const state = { open: false }
  state.open = true
  return <p data-open={state.open}>t</p>
}`,
    'a destructured prop': `${CLIENT}export function C({ items }: { items: string[] }) {
  items.push('z')
  return <p>{items.length}</p>
}`,
    'the props object': `${CLIENT}export function C(props: { items: string[] }) {
  props.items.push('z')
  return <p>{props.items.length}</p>
}`,
    'a memo declared before the statement that may hold the written object': `${CLIENT}export function C() {
  const local = ['y']
  const n = createMemo(() => local)
  local.push('z')
  return <p>{n().length}</p>
}`,
    'a constant declared before the statement that aliases the written object': `export function C() {
  const local = ['y']
  const alias = local
  local.push('z')
  return <p>{alias.join(',')}</p>
}`,
    'a function declared before the statement, called by the markup': `${CLIENT}export function C() {
  const local = ['y']
  const count = () => local.length
  local.push('z')
  return <p>{count()}</p>
}`,
    'a direct read beside a memo declared before the statement': `${CLIENT}export function C() {
  const local = ['y']
  const n = createMemo(() => local.length)
  local.push('z')
  return <p>{n()}{local.length}</p>
}`,
    'a shallow copy made before the statement that shares the object written': `export function C() {
  const rows = [{ done: false }]
  const copy = [...rows]
  rows[0].done = true
  return <p>{copy.length}</p>
}`,
    'a write after a block in an in-place callback that declares the same name': `${CLIENT}export function C() {
  const local = ['y']
  ;[1].forEach(x => { if (x) { const local: string[] = []; local.length }; local.push('z') })
  return <p>{local.length}</p>
}`,
    'an assignment after a block in an in-place callback that declares the same name': `${CLIENT}export function C() {
  let total = 0
  ;[1].forEach(x => { if (x) { let total = 5; total += x }; total = Math.max(total, x) })
  return <p>{total}</p>
}`,
    'a write after a block of the statement that declares the same name': `${CLIENT}export function C(props: { on: boolean }) {
  const local = ['y']
  if (props.on) {
    { const local: string[] = []; local.push('q') }
    local.push('z')
  }
  return <p>{local.length}</p>
}`,
    'a write in a callback the statement runs in place': `${CLIENT}export function C() {
  const out: string[] = []
  ;['a'].forEach(x => out.push(x))
  return <p>{out.length}</p>
}`,
    'an assignment in an IIFE': `${CLIENT}export function C() {
  let total = 0
  ;(() => { total = Math.max(total, 1) })()
  return <p>{total}</p>
}`,
    'the written member of the props object': `${CLIENT}export function C(props: { items: string[]; title: string }) {
  props.items.push('z')
  return <p>{props.title}{props.items.length}</p>
}`,
    'any member after a write to the props object as a whole': `${CLIENT}export function C(props: { items: string[]; title: string }) {
  Object.assign(props, { title: 'x' })
  return <p>{props.title}</p>
}`,
    'any member after a write to a computed member': `${CLIENT}export function C(props: { items: string[]; title: string; k: 'title' }) {
  props[props.k] = 'x'
  return <p>{props.items.length}</p>
}`,
    'a computed member read beside a written member': `${CLIENT}export function C(props: { items: string[]; title: string; k: 'title' }) {
  props.items.push('z')
  return <p>{props[props.k]}</p>
}`,
    'a component with no client side': `export function C({ code }: { code: string }) {
  const lines = code.split('\\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return <pre>{lines.map((l, i) => <span key={i}>{l}</span>)}</pre>
}`,
  }
  for (const [name, source] of Object.entries(refused)) {
    test(`refuses ${name}, with the rewrite and the /* @client */ escapes`, () => {
      const found = refusals(source)
      expect(found).toHaveLength(1)
      expect(found[0]!.message).toContain('read by the server render')
      expect(escapeKinds(found[0])).toEqual(['rewrite', 'client-directive'])
    })
  }

  test('reports each written binding once, however many positions read it', () => {
    const found = refusals(`${CLIENT}export function C() {
  const a = ['y']
  const b = ['y']
  a.push('z')
  b.push('z')
  return <p data-a={a.length} data-b={b.length}>{a.length}{b.length}</p>
}`)
    expect(found.map(e => e.message.slice(0, 3))).toEqual(["'a'", "'b'"])
  })

  test('a /* @client */ read is not a server read', () => {
    expect(errorsOf(`${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <p data-n={/* @client */ local.length}>{/* @client */ local.length}</p>
}`)).toEqual([])
  })
})

describe('#3719: an init-time read declared after the statement', () => {
  const refused: Record<string, [string, string]> = {
    'a memo': ["Memo 'n'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const n = createMemo(() => local.length)
  return <p>{n()}</p>
}`],
    'a memo read only under /* @client */': ["Memo 'n'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const n = createMemo(() => local.length)
  return <p>{/* @client */ n()}</p>
}`],
    'a signal seed read only by a handler': ["Signal 'n'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const [n] = createSignal(local.length)
  return <button onClick={() => console.log(n())}>x</button>
}`],
    'a constant read only by a handler': ["'len'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const len = local.length
  return <button onClick={() => console.log(len)}>x</button>
}`],
    'a memo reading it through a function': ["Memo 'n'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const count = () => local.length
  const n = createMemo(() => count())
  return <button onClick={() => console.log(n())}>x</button>
}`],
    'a memo reading the written props member through a function': ["Memo 't'", `${CLIENT}export function C(props: { local: string[]; title: string }) {
  const local = props
  local.local.push('z')
  const len = () => local.local.length
  const t = createMemo(() => len())
  return <button onClick={() => console.log(t())}>x</button>
}`],
    'a constant that calls a function reading it': ["'n'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const read = () => local.length
  const n = read()
  return <button onClick={() => console.log(n)}>x</button>
}`],
    'a constant that copies it': ["'copy'", `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const copy = [...local]
  return <button onClick={() => console.log(copy)}>x</button>
}`],
    'a memo over a renamed body destructure default': ["Memo 'n'", `${CLIENT}export function C(props: { b?: string[] }) {
  const { b: local = ['y', ''].filter((x) => x !== '') } = props
  local.push('z')
  const n = createMemo(() => local.length)
  return <p>{n()}</p>
}`],
  }
  for (const [name, [subject, source]] of Object.entries(refused)) {
    test(`refuses ${name}, with the rewrite as the only escape`, () => {
      const found = refusals(source)
      expect(found).toHaveLength(1)
      expect(found[0]!.message.startsWith(`${subject} reads 'local' after a statement`)).toBe(true)
      expect(escapeKinds(found[0])).toEqual(['rewrite'])
    })
  }

  test('a component with no client side has no init to read too early', () => {
    expect(errorsOf(`export function C() {
  const xs = ['y']
  xs.push('z')
  const n = xs.length
  return <p>t</p>
}`)).toEqual([])
  })
})

describe('#3719: reads that see the written value compile', () => {
  const accepted: Record<string, string> = {
    'a read in an event handler': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <button onClick={() => console.log(local.length)}>x</button>
}`,
    'a declaration before the statement, read by a handler': `${CLIENT}export function C() {
  const local = ['y']
  const first = local[0]
  local.push('z')
  return <button onClick={() => console.log(first)}>x</button>
}`,
    'a function declared after the statement, called later': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const count = () => local.length
  return <button onClick={() => console.log(count())}>x</button>
}`,
    'a write inside a callback the statement only defines': `${CLIENT}export function C() {
  const local = ['y']
  setTimeout(() => local.push('z'), 10)
  return <p>{local.length}</p>
}`,
    'a value handed to a child as a prop': `${CLIENT}function Child(props: { items: string[] }) { return <i>{props.items.length}</i> }
export function C() {
  const items = ['y']
  items.push('z')
  return <Child items={items} />
}`,
    'a memo declared before the statement, read by the markup': `${CLIENT}export function C() {
  const local = ['y']
  const n = createMemo(() => local.length)
  local.push('z')
  return <p>{n()}</p>
}`,
    'a signal seeded before the statement, read by the markup': `${CLIENT}export function C() {
  const local = ['y']
  const [n] = createSignal(local.length)
  local.push('z')
  return <p>{n()}</p>
}`,
    'a memo declared before the statement reading it through a function': `${CLIENT}export function C() {
  const local = ['y']
  const count = () => local.length
  const n = createMemo(() => count() + 0)
  local.push('z')
  return <p>{n()}</p>
}`,
    'a memo declared before a reassignment, which keeps the earlier value': `${CLIENT}export function C(props: { a: number }) {
  let x = props.a
  const y = createMemo(() => x)
  x = Math.max(x, 3)
  return <p>{y()}</p>
}`,
    'another member of the props object than the written one': `${CLIENT}export function C(props: { items: string[]; title: string }) {
  props.items.push('z')
  return <p title={props.title}>{props.title}</p>
}`,
    'a memo after the statement over another member of the props object': `${CLIENT}export function C(props: { items: string[]; title: string }) {
  props.items.push('z')
  const t = createMemo(() => props.title)
  return <p>{t()}</p>
}`,
    'a spread copy made before the statement': `${CLIENT}export function C() {
  const local = ['y']
  const copy = [...local]
  local.push('z')
  return <p>{copy.join(',')}</p>
}`,
    'a map copy made before the statement': `export function C() {
  const local = ['y']
  const copy = local.map(x => x)
  local.push('z')
  return <p>{copy.join(',')}</p>
}`,
    'handlers created after the statement that read it when called': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const handlers = { read: () => local.length }
  return <button onClick={() => console.log(handlers.read())}>x</button>
}`,
    'a function stored after the statement without being called': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const read = () => local.length
  const handlers = { read }
  const list = [read]
  return <button onClick={() => console.log(handlers.read(), list[0]())}>x</button>
}`,
    'an alias taken after an in-place write, read by a handler': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  const alias = local
  const box = { items: local }
  return <button onClick={() => console.log(alias.length, box.items.length)}>x</button>
}`,
    'a write in a block of an in-place callback to a name the block declares': `${CLIENT}export function C() {
  const local = ['y']
  ;[1].forEach(x => { if (x) { const local: string[] = []; local.push('z') } })
  return <p>{local.length}</p>
}`,
    'a callback run in place that writes only its own parameter': `${CLIENT}export function C() {
  const rows: string[][] = [[]]
  ;[['a']].forEach(rows => rows.push('x'))
  return <p>{rows.length}</p>
}`,
    'a callback run in place that writes a variable it declares': `${CLIENT}export function C() {
  const out: string[] = ['a']
  ;['a'].forEach(x => { const out: string[] = []; out.push(x) })
  return <p>{out.length}</p>
}`,
    'a pure let reassignment, folded into its initializer': `${CLIENT}export function C(props: { l?: string }) {
  let label = props.l ?? 'd'
  if (!label) label = 'f'
  return <p>{label}</p>
}`,
    'a loop row named like the written binding': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <ul>{['a'].map(local => <li key={local}>{local}</li>)}</ul>
}`,
    'a string that contains the written name': `${CLIENT}export function C() {
  const local = ['y']
  local.push('z')
  return <p title="local.length">local</p>
}`,
    'a statement that writes a global': `${CLIENT}export function C() {
  const title = 'T'
  if (typeof document !== 'undefined') document.title = title
  return <p>{title}</p>
}`,
  }
  for (const [name, source] of Object.entries(accepted)) {
    test(name, () => {
      expect(errorsOf(source)).toEqual([])
    })
  }
})

describe('#3719: other copies made before the statement are not statement-write refusals', () => {
  // The client JS's own stage check (BF061) still refuses a constant derived
  // from an init-scope local the template reads through these forms; what is
  // pinned here is that `checkStatementWrites` does not.
  const copies: Record<string, string> = {
    'slice, filter, concat and Array.from copies made before the statement': `export function C() {
  const local = ['y']
  const a = local.slice()
  const b = local.filter(x => x !== '')
  const c = local.concat(['q'])
  const d = Array.from(local)
  local.push('z')
  return <p>{a.length}{b.length}{c.length}{d.length}</p>
}`,
    'an object spread copy made before a write to one of its own slots': `export function C() {
  const state = { open: false, n: 1 }
  const before = { ...state }
  state.open = true
  return <p data-open={before.open}>{before.n}</p>
}`,
  }
  for (const [name, source] of Object.entries(copies)) {
    test(name, () => {
      expect(refusals(source)).toEqual([])
    })
  }
})
