/**
 * `checkStatementWrites` (#3719): a binding a component-body statement
 * writes after its declaration is refused (BF101) where the compiled output
 * would read it as it was declared — a server read, or an init-time read
 * declared after the statement — and compiles everywhere else.
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
    'a read through a memo declared before the statement': `${CLIENT}export function C() {
  const local = ['y']
  const n = createMemo(() => local.length)
  local.push('z')
  return <p>{n()}</p>
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
