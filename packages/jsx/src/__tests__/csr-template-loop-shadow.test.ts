/**
 * A memo inlined into the CSR template inside a `.map()` row whose binding
 * shadows a name the memo reads (#3352). The memo body must resolve in its
 * declaration scope, not against the row binding.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../index'
import { HonoAdapter } from '../../../adapter-hono/src/adapter'

/** Compile `source` and evaluate its CSR template lambda with `props`. */
function renderTemplate(source: string, name: string, props: Record<string, unknown>): string {
  const result = compileJSX(source, 'loop-shadow.tsx', { adapter: new HonoAdapter() })
  expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
  const clientJs = result.files.filter(f => f.type === 'clientJs').map(f => f.content).join('\n')
  const line = clientJs.split('\n').find(l => l.startsWith(`hydrate('${name}'`))
  expect(line).toBeDefined()
  const lambda = line!.slice(line!.indexOf('template: ') + 'template: '.length, line!.lastIndexOf(' })'))
  const helpers = clientJs.slice(0, clientJs.indexOf('export function init'))
    .split('\n').filter(l => /^(var|const|function) /.test(l)).join('\n')
  const escape = (v: unknown) => String(v)
  const template = new Function('escapeAttr', 'escapeText', `${helpers}\nreturn (${lambda})`)(escape, escape)
  return template(props)
}

describe('CSR template: memo read under a shadowing loop binding (#3352)', () => {
  test("resolves the memo body's dependency to the signal, not the row param", () => {
    const html = renderTemplate(`
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function C(props: { rows: string[] }) {
  const [s] = createSignal('outer')
  const label = createMemo(() => s() + '!')
  return <ul>{props.rows.map(s => <li key={s} title={label()}>{s}</li>)}</ul>
}
`, 'C', { rows: ['x', 'y'] })
    expect(html).toContain('title="outer!"')
    expect(html).not.toContain('title="x')
  })

  test('evaluates the memo outside the row when its body reads a module helper the row param shadows', () => {
    const html = renderTemplate(`
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
function fmt(v: string) { return '[' + v + ']' }
export function C(props: { rows: string[] }) {
  const [s] = createSignal('outer')
  const label = createMemo(() => fmt(s()))
  return <ul>{props.rows.map(fmt => <li key={fmt} title={label()}>{fmt}</li>)}</ul>
}
`, 'C', { rows: ['x', 'y'] })
    expect(html).toContain('title="[outer]"')
  })

  test('defers a row read of an init-only memo instead of hoisting `undefined`', () => {
    const html = renderTemplate(`
'use client'
import { createMemo } from '@barefootjs/client'
function fmt(v: string) { return '[' + v + ']' }
export function C(props: { rows: string[] }) {
  const local = () => 'outer'
  const label = createMemo(() => fmt(local()))
  return <ul>{props.rows.map(fmt => <li key={fmt}>{label().length}</li>)}</ul>
}
`, 'C', { rows: ['x'] })
    expect(html).not.toContain('__bf_outer_')
    expect(html).toContain('<li')
  })

  test('a row param shadowing the memo itself reads the row item', () => {
    const html = renderTemplate(`
'use client'
import { createMemo, createSignal } from '@barefootjs/client'
export function C(props: { rows: string[] }) {
  const [s] = createSignal('outer')
  const label = createMemo(() => s() + '!')
  return <ul>{props.rows.map(label => <li key={label} title={label}>{s()}</li>)}</ul>
}
`, 'C', { rows: ['x', 'y'] })
    expect(html).toContain('title="x"')
    expect(html).toContain('outer')
  })
})
