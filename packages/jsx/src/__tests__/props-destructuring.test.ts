/**
 * Destructured-Props Type Resolution Tests
 *
 * Pins that a destructured prop's declared TYPE resolves from the param's
 * type annotation (#2150). The reactivity half of this file is gone: BF043
 * ("props destructuring breaks reactivity") is retired, and the live-read
 * rewrite that replaced it is covered by `destructured-props-live.test.ts`.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'

describe('Destructured props keep their declared types (#2150)', () => {
  const typeOf = (ctx: ReturnType<typeof analyzeComponent>, name: string) =>
    ctx.propsParams.find((p) => p.name === name)?.type

  test('resolves scalar member types from a type-alias annotation', () => {
    const source = `
      type Props = {
        value: number
        label: string
      }

      export function Component({ value, label }: Props) {
        return <div>{label}: {value}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(typeOf(ctx, 'value')).toEqual({ kind: 'primitive', primitive: 'number', raw: 'number' })
    expect(typeOf(ctx, 'label')).toEqual({ kind: 'primitive', primitive: 'string', raw: 'string' })
  })

  test('resolves member types from an inline type literal', () => {
    const source = `
      export function Component({ value }: { value: number }) {
        return <div>{value}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(typeOf(ctx, 'value')).toEqual({ kind: 'primitive', primitive: 'number', raw: 'number' })
  })

  test('resolves member types from an interface annotation', () => {
    const source = `
      interface Props {
        value: number
      }

      export function Component({ value }: Props) {
        return <div>{value}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(typeOf(ctx, 'value')).toEqual({ kind: 'primitive', primitive: 'number', raw: 'number' })
  })

  test('keys the lookup on the source property name for aliased bindings', () => {
    const source = `
      type Props = { value: number }

      export function Component({ value: v }: Props) {
        return <div>{v}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    // The local binding is 'v', but its type comes from the 'value' member.
    expect(typeOf(ctx, 'v')).toEqual({ kind: 'primitive', primitive: 'number', raw: 'number' })
  })

  test('falls back to unknown when the param has no type annotation', () => {
    const source = `
      export function Component({ value }) {
        return <div>{value}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(typeOf(ctx, 'value')).toEqual({ kind: 'unknown', raw: 'unknown' })
  })

  // #2259: optional primitives resolve type AND optionality, same as the
  // props-object path — pre-#2259 they were skipped wholesale so typed
  // adapters kept a nillable interface{} field; #2252's nullish-flip
  // machinery now supplies the absent representation where it matters.
  test('resolves OPTIONAL primitive members with optional: true (#2259)', () => {
    const source = `
      type Props = { label: string; size?: number; on?: boolean }

      export function Component({ label, size, on }: Props) {
        return <div>{label}{size ?? 0}{on ? 'y' : 'n'}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const param = (name: string) => ctx.propsParams.find((p) => p.name === name)
    expect(param('label')).toMatchObject({
      type: { kind: 'primitive', primitive: 'string' },
      optional: false,
    })
    expect(param('size')).toMatchObject({
      type: { kind: 'primitive', primitive: 'number' },
      optional: true,
    })
    expect(param('on')).toMatchObject({
      type: { kind: 'primitive', primitive: 'boolean' },
      optional: true,
    })
  })

  // A non-primitive optional keeps `unknown` (interface{}-based lowering)
  // but still reports the type's `?` — the adversarial catalogue derives
  // absent points from `optional` alone.
  test('marks OPTIONAL non-primitive members optional while keeping unknown type (#2259)', () => {
    const source = `
      type Todo = { id: number }
      type Props = { items?: Todo[] }

      export function Component({ items }: Props) {
        return <div>{(items ?? []).length}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(ctx.propsParams.find((p) => p.name === 'items')).toMatchObject({
      type: { kind: 'unknown', raw: 'unknown' },
      optional: true,
    })
  })

  // A destructure default and the type's `?` both mean "caller may omit";
  // the default keeps `defaultValue` so adapters bake it (and the Go
  // nullish flip keeps excluding defaulted props).
  test('keeps defaultValue alongside optional for `{ size = 5 }` (#2259)', () => {
    const source = `
      export function Component({ size = 5 }: { size?: number }) {
        return <div>{size}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(ctx.propsParams.find((p) => p.name === 'size')).toMatchObject({
      type: { kind: 'primitive', primitive: 'number' },
      optional: true,
      defaultValue: '5',
    })
  })

  // #2677: a STRUCTURAL member (array/object) built entirely out of
  // primitives resolves fully now — go-template's `emitSynthPropStructs`
  // (#2674/#2676) can synthesize a real struct for either shape, so the
  // #2150 "unchecked assertion" concern doesn't apply to them any more.
  // `rows: number[][]` is a nested array of primitives; `meta: { id:
  // string }` is an inline object literal with a primitive property.
  test('resolves STRUCTURAL members (nested arrays / inline objects) built entirely out of primitives (#2677)', () => {
    const source = `
      type Props = { rows: number[][]; meta: { id: string } }

      export function Component({ rows, meta }: Props) {
        return <div>{rows.length}{meta.id}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(typeOf(ctx, 'rows')).toEqual({
      kind: 'array',
      raw: 'number[][]',
      elementType: { kind: 'array', raw: 'number[]', elementType: { kind: 'primitive', raw: 'number', primitive: 'number' } },
    })
    expect(typeOf(ctx, 'meta')).toEqual({
      kind: 'object',
      raw: '{ id: string }',
      properties: [{ name: 'id', type: { kind: 'primitive', raw: 'string', primitive: 'string' }, optional: false, readonly: false }],
    })
  })

  // A structural member declines WHOLLY (not per-leaf) when ANY reachable
  // leaf is a union, a function, or an un-catalogued named type — the same
  // three shapes `isResolvableMemberType` declines at the top level.
  test('declines a structural member when a nested leaf is a union/function/un-catalogued named type (#2677)', () => {
    const source = `
      type Props = {
        variants: { id: string; kind: 'a' | 'b' }[]
        handlers: { onClick: () => void }
        configs: { data: Map<string, string> }
      }

      export function Component({ variants, handlers, configs }: Props) {
        return <div>{variants.length}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    expect(typeOf(ctx, 'variants')).toEqual({ kind: 'unknown', raw: 'unknown' })
    expect(typeOf(ctx, 'handlers')).toEqual({ kind: 'unknown', raw: 'unknown' })
    expect(typeOf(ctx, 'configs')).toEqual({ kind: 'unknown', raw: 'unknown' })
  })
})
