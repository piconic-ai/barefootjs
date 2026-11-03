/**
 * #3861 — a spread of an object other than the component's own props onto
 * a child component (`<Chip {...row} />`, a loop row's `{...r}`). The client
 * merges it with the call's explicit props in source order, in the CSR
 * template (`renderChild`) and in init (`spreadChildProps`), instead of
 * dropping it. A const alias of a closed-type rest (`const a = rest`) is the
 * rest itself, so its spread unrolls per key like `{...rest}` does.
 *
 * The rendered output is pinned by the `object-spread-loop-row-child`,
 * `object-spread-prop-child` and `rest-alias-spread-child` fixtures; the
 * runtime merge by `packages/client/__tests__/runtime/spread-child-props.test.ts`.
 */
import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function compile(source: string): { js: string; errors: string[] } {
  const result = compileJSX(source, 'Repro.tsx', { adapter })
  const js = result.files.filter(f => f.path.endsWith('.js')).map(f => f.content).join('\n')
  return { js, errors: result.errors.map(e => `${e.code} ${e.message}`) }
}

const CHIP = `function Chip(props: { id?: string; label?: string; tone?: string; size?: number }) {
  return <span data-id={props.id} data-tone={props.tone} data-size={props.size}>{props.label}</span>
}`

describe('#3861 — an object spread onto a child component', () => {
  test('a loop row spread reaches the CSR template and each row init', () => {
    const { js, errors } = compile(`'use client'
${CHIP}
type Row = { id: string; label: string }
export function List({ rows }: { rows: Row[] }) {
  return <div>{rows.map(r => <Chip key={r.id} tone="base" {...r} />)}</div>
}`)
    expect(errors).toEqual([])
    expect(js).toContain(`renderChild('Chip`)
    expect(js).toContain(`{tone: "base", ...r}`)
    expect(js).toContain(`spreadChildProps({ get tone() { return "base" } }, () => (r()))`)
  })

  test('an object prop spread merges with explicit props in source order', () => {
    const { js, errors } = compile(`'use client'
${CHIP}
export function One({ row }: { row: { id: string; label: string } }) {
  return <div><Chip label="ignored" {...row} id="fixed" /></div>
}`)
    expect(errors).toEqual([])
    expect(js).toContain(`{label: "ignored", ..._p.row, id: "fixed"}`)
    expect(js).toContain(`spreadChildProps({ label: "ignored" }, () => (_p.row), { id: "fixed" })`)
  })

  test('an object spread next to a props-object spread merges both as parts', () => {
    const { js, errors } = compile(`'use client'
${CHIP}
export function Both(props: { row: { id: string }; tone?: string }) {
  return <div><Chip label="d" {...props.row} {...props} tone="t" /></div>
}`)
    expect(errors).toEqual([])
    expect(js).toContain(`spreadChildProps({ label: "d" }, () => (_p.row), () => _p, { tone: "t" })`)
  })

  test('an object spread an init-only local holds defers the child to init', () => {
    const { js, errors } = compile(`'use client'
${CHIP}
export function Local({ n }: { n: string }) {
  let count = 0
  const extra = { id: n, label: 'L' + (count++) }
  return <div><Chip {...extra} /></div>
}`)
    expect(errors).toEqual([])
    expect(js).toContain('data-bf-ph="s0"')
    expect(js).toContain(`upsertChild(__scope, 'Chip`)
    expect(js).toContain('spreadChildProps(() => (extra))')
  })

  test('an object spread before a rest bag merges the bag as a later part', () => {
    const { js, errors } = compile(`'use client'
${CHIP}
export function Mixed({ row, className, ...rest }: { row: { id: string }; className?: string; [key: string]: unknown }) {
  return <div><Chip {...row} {...rest} tone={className} /></div>
}`)
    expect(errors).toEqual([])
    expect(js).toContain(`spreadChildProps(() => (_p.row), forwardProps(_p, {}, ["row","className"]), { get tone() { return _p.className } })`)
  })

  test('a const alias of a closed rest unrolls per key and leaves out the destructured keys', () => {
    const { js, errors } = compile(`'use client'
${CHIP}
export function Alias({ label, ...rest }: { label: string; tone?: string; size?: number }) {
  const a = rest
  const b = a
  return <div><Chip {...b} tone="override" label={label} /><Chip {...a} /></div>
}`)
    expect(errors).toEqual([])
    expect(js).toContain(`{tone: _p.tone, size: _p.size, tone: "override", label: _p.label}`)
    expect(js).toContain(`{tone: _p.tone, size: _p.size}, undefined, 's1'`)
    expect(js).toContain(`{ get tone() { return _p.tone }, get size() { return _p.size } }`)
    expect(js).not.toContain('forwardProps(')
  })
})
