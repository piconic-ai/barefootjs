/**
 * An optional, no-default prop read under `??` inside a memo body is
 * nillable — every optional prop is a `bf.Opt[T]` Input field read into an
 * `interface{}` one (U8) — so the runtime evaluator that computes the memo
 * sees `undefined` for an omitted prop and takes the fallback. A literal
 * union (`'a' | 'b'`, `1 | 2`) is typed like its primitive. Pins what the
 * shared fixture `memo-nullish-omitted-literal-union-prop` cannot show on
 * its own, including a callback param shadowing the prop inside the memo
 * body.
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

/** The Go type the constructor reads `field` of `<component>Input` as (`bf<component>In`). */
function readFieldType(types: string, component: string, field: string): string | undefined {
  return structFieldType(types, `bf${component}In`, field)
}

describe('a prop read under `??` in a memo body is nillable', () => {
  test('primitive and literal-union props, props object and destructured', () => {
    const types = compileTypes(`
'use client'
import { createMemo } from '@barefootjs/client'
export function P(props: { s?: string; n?: number; u?: 'a' | 'b'; l?: 1 | 2; z?: string }) {
  const m = createMemo(() => \`\${props.s ?? 'x'}\${props.u ?? 'c'}\`)
  const k = createMemo(() => (props.n ?? 3) * (props.l ?? 4))
  const e = createMemo(() => props.z ?? '')
  return <b>{m()}{k()}{e()}</b>
}
`)
    for (const field of ['S', 'N', 'U', 'L', 'Z']) expect(readFieldType(types, 'P', field)).toBe('interface{}')
    expect(structFieldType(types, 'PInput', 'U')).toBe('bf.Opt[string]')
    expect(structFieldType(types, 'PInput', 'L')).toBe('bf.Opt[float64]')
  }, 30_000)

  test('a callback param shadowing the prop reads the param', () => {
    const types = compileTypes(`
'use client'
import { createMemo } from '@barefootjs/client'
export function D({ size, rows }: { size?: string; rows: (string | undefined)[] }) {
  const all = createMemo(() => rows.map(size => size ?? 'x').join(','))
  return <b>{all()}</b>
}
export function O(props: { size?: string; rows: { size?: string }[] }) {
  const all = createMemo(() => props.rows.map(props => props.size ?? 'x').join(','))
  return <b>{all()}</b>
}
`)
    expect(readFieldType(types, 'D', 'Size')).toBe('interface{}')
    expect(readFieldType(types, 'O', 'Size')).toBe('interface{}')
    // The callback's `size` is the row, not the prop: the evaluator env
    // carries the rows only.
    expect(types).not.toContain('"size": in.Size')
  }, 30_000)
})
