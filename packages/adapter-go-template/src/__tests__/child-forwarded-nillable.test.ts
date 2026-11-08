/**
 * A prop forwarded as it is into a child reaches it as its JS value: every
 * optional prop is a `bf.Opt[T]` Input field the constructor reads into a
 * nillable `interface{}` field (`bf<Name>In`), so an omitted prop reaches
 * the child as `undefined` whatever the child does with it, and the parent
 * writes the child's field through `bf.Coerce`. Pins what the shared fixture
 * `child-forwarded-omitted-optional-number` cannot show on its own: the
 * typing holds through a chain of forwarders registered before the child,
 * and a required prop keeps its concrete type.
 */
import { describe, expect, test } from 'bun:test'
import { compileFixtureJSX } from '@barefootjs/adapter-tests/harness-program'
import { GoTemplateAdapter } from '../adapter/go-template-adapter'

function compileTypes(source: string): string {
  const result = compileFixtureJSX(source, 'component.tsx', { adapter: new GoTemplateAdapter() })
  expect(result.errors).toEqual([])
  return result.files.find(f => f.type === 'types')?.content ?? ''
}

/** The Go type of `field` in the struct `typeName`. */
function structFieldType(types: string, typeName: string, field: string): string | undefined {
  const start = types.indexOf(`type ${typeName} struct {`)
  if (start < 0) return undefined
  const body = types.slice(start, types.indexOf('\n}', start))
  const line = body.split('\n').map(l => l.trim()).find(l => l.startsWith(`${field} `))
  return line?.slice(field.length + 1).trim().replace(/\s*`[^`]*`$/, '')
}

/** The Go type of `field` in `<component>Input`. */
function inputFieldType(types: string, component: string, field: string): string | undefined {
  return structFieldType(types, `${component}Input`, field)
}

/** The Go type the constructor reads `field` of `<component>Input` as (`bf<component>In`). */
function readFieldType(types: string, component: string, field: string): string | undefined {
  return structFieldType(types, `bf${component}In`, field) ?? inputFieldType(types, component, field)
}

const SHOW = `
function Show(props: { value?: number }) {
  return <i>{props.value ?? 'none'}</i>
}
`

describe('a prop forwarded into a child reaches it as its JS value (#3778, U8)', () => {
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
    for (const [component, field] of [['Middle', 'Count'], ['Outer', 'N'], ['Page', 'Total']]) {
      expect(inputFieldType(types, component, field)).toBe('bf.Opt[float64]')
      expect(readFieldType(types, component, field)).toBe('interface{}')
    }
    expect(types).toContain('Count: bf.Coerce(MiddleInput{}.Count, in.N)')
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
    // The prop itself is optional, so a `bf.Opt[float64]` either way; the
    // row's value is what reaches the child.
    expect(inputFieldType(types, 'Destructured', 'Count')).toBe('bf.Opt[float64]')
    expect(inputFieldType(types, 'PropsObject', 'Count')).toBe('bf.Opt[float64]')
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
    expect(readFieldType(types, 'ViaConst', 'Count')).toBe('interface{}')
    expect(readFieldType(types, 'ViaMemo', 'Count')).toBe('interface{}')
    expect(readFieldType(types, 'Shadowed', 'Count')).toBe('interface{}')
  }, 30_000)

  test('a required prop keeps its concrete type; an optional one forwarded into it is coerced', () => {
    const types = compileTypes(`
function Price(props: { value: number }) {
  return <i>{props.value}</i>
}
export function Page(props: { count?: number }) {
  return <div><Price value={props.count} /></div>
}
`)
    expect(inputFieldType(types, 'Price', 'Value')).toBe('float64')
    expect(inputFieldType(types, 'Page', 'Count')).toBe('bf.Opt[float64]')
  }, 30_000)
})
