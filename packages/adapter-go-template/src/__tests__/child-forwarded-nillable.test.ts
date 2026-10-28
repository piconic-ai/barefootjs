/**
 * A prop forwarded as it is into a child's nillable Input field takes the
 * nillable field itself (`collectNillableForwardedPropNames`), so an omitted
 * prop reaches the child as nil. Pins what the shared fixture
 * `child-forwarded-omitted-optional-number` cannot show on its own: the
 * decision holds through a chain of forwarders registered before the child,
 * follows the real bindings (a loop row shadowing the prop forwards the row,
 * not the prop), and leaves a prop forwarded into a concrete field alone.
 */
import { describe, expect, test } from 'bun:test'
import { compileFixtureJSX } from '@barefootjs/adapter-tests/harness-program'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function compileTypes(source: string): string {
  const result = compileFixtureJSX(source, 'component.tsx', { adapter: new GoTemplateAdapter() })
  expect(result.errors).toEqual([])
  return result.files.find(f => f.type === 'types')?.content ?? ''
}

/** The Go type of `field` in `<component>Input`. */
function inputFieldType(types: string, component: string, field: string): string | undefined {
  const start = types.indexOf(`type ${component}Input struct {`)
  if (start < 0) return undefined
  const body = types.slice(start, types.indexOf('\n}', start))
  const line = body.split('\n').map(l => l.trim()).find(l => l.startsWith(`${field} `))
  return line?.slice(field.length + 1).trim()
}

const SHOW = `
function Show(props: { value?: number }) {
  return <i>{props.value ?? 'none'}</i>
}
`

describe('a prop forwarded into a child\'s nillable field is nillable (#3778)', () => {
  test('through a chain of forwarders declared before the child', () => {
    const types = compileTypes(`
function Outer({ n }: { n?: number }) {
  return <Middle count={n} />
}
function Middle(props: { count?: number }) {
  return <Show value={props.count} />
}
${SHOW}
export function Page(props: { total?: number }) {
  return <div><Outer n={props.total} /></div>
}
`)
    expect(inputFieldType(types, 'Middle', 'Count')).toBe('interface{}')
    expect(inputFieldType(types, 'Outer', 'N')).toBe('interface{}')
    expect(inputFieldType(types, 'Page', 'Total')).toBe('interface{}')
    expect(types).not.toContain('bf.Number(in.')
  }, 30_000)

  test('a loop row shadowing the prop forwards the row, not the prop', () => {
    const types = compileTypes(`
${SHOW}
function Destructured({ count, rows }: { count?: number; rows: number[] }) {
  return <ul>{rows.map((count, i) => <li key={i}><Show value={count} /></li>)}</ul>
}
function PropsObject(props: { count?: number; rows: { count?: number }[] }) {
  return <ul>{props.rows.map((props, i) => <li key={i}><Show value={props.count} /></li>)}</ul>
}
export function Page() {
  return <div><Destructured rows={[1]} /><PropsObject rows={[{}]} /></div>
}
`)
    expect(inputFieldType(types, 'Destructured', 'Count')).toBe('float64')
    expect(inputFieldType(types, 'PropsObject', 'Count')).toBe('float64')
  }, 30_000)

  test('through a const or an identity memo, unless a loop row rebinds the const', () => {
    const types = compileTypes(`
'use client'
import { createMemo } from '@barefootjs/client'
${SHOW}
function ViaConst(props: { count?: number }) {
  const c = props.count
  return <Show value={c} />
}
function ViaMemo({ count }: { count?: number }) {
  const relayed = createMemo(() => count)
  return <Show value={relayed()} />
}
function Shadowed(props: { count?: number; rows: number[] }) {
  const c = props.count
  return <ul>{props.rows.map((c, i) => <li key={i}><Show value={c} /></li>)}</ul>
}
export function Page() {
  return <div><ViaConst /><ViaMemo /><Shadowed rows={[1]} /></div>
}
`)
    expect(inputFieldType(types, 'ViaConst', 'Count')).toBe('interface{}')
    expect(inputFieldType(types, 'ViaMemo', 'Count')).toBe('interface{}')
    expect(inputFieldType(types, 'Shadowed', 'Count')).toBe('float64')
  }, 30_000)

  test('a prop forwarded into a concrete field keeps its concrete type', () => {
    const types = compileTypes(`
function Price(props: { value: number }) {
  return <i>{props.value}</i>
}
export function Page(props: { count?: number }) {
  return <div><Price value={props.count} /></div>
}
`)
    expect(inputFieldType(types, 'Price', 'Value')).toBe('float64')
    expect(inputFieldType(types, 'Page', 'Count')).toBe('float64')
  }, 30_000)
})
