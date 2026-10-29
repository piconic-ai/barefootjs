/**
 * An optional, no-default prop read under `??` inside a memo body is
 * nillable (`collectNullishConsumedPropNames`), so the runtime evaluator
 * that computes the memo sees nil for an omitted prop and takes the
 * fallback. A literal union (`'a' | 'b'`, `1 | 2`) takes the same flip as
 * its primitive. Pins what the shared fixture
 * `memo-nullish-omitted-literal-union-prop` cannot show on its own: a
 * callback param shadowing the prop inside the memo body reads the param,
 * so it leaves the prop's field concrete.
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
    expect(inputFieldType(types, 'P', 'S')).toBe('interface{}')
    expect(inputFieldType(types, 'P', 'N')).toBe('interface{}')
    expect(inputFieldType(types, 'P', 'U')).toBe('interface{}')
    expect(inputFieldType(types, 'P', 'L')).toBe('interface{}')
    // `?? ''` lands on the zero value either way.
    expect(inputFieldType(types, 'P', 'Z')).toBe('string')
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
    expect(inputFieldType(types, 'D', 'Size')).toBe('string')
    expect(inputFieldType(types, 'O', 'Size')).toBe('string')
  }, 30_000)
})
