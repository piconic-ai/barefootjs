/**
 * Props Destructuring Warning Tests
 *
 * Tests for BF043: Props destructuring in function parameters breaks reactivity.
 * BF043 is only emitted for stateful components (with signals/memos/effects).
 * Stateless components can safely destructure props.
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { ErrorCodes } from '../errors'

describe('Props Destructuring Warning (BF043)', () => {
  test('warns on destructured props in stateful component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
      }

      export function Component({ checked }: Props) {
        const [count, setCount] = createSignal(0)
        return <div>{checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1)
    expect(propsWarnings[0].severity).toBe('warning')
    expect(propsWarnings[0].suggestion?.message).toContain('props object')
  })

  test('no warning on destructured props in stateless component', () => {
    const source = `
      interface Props {
        checked: boolean
      }

      export function Component({ checked }: Props) {
        return <div>{checked}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(0)
  })

  test('warns on rest props in stateful component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
      }

      export function Component({ ...props }: Props) {
        const [count, setCount] = createSignal(0)
        return <div>{props.checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1)
  })

  test('warns on partial destructuring with rest props in stateful component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        onClick: () => void
        checked: boolean
      }

      export function Component({ onClick, ...rest }: Props) {
        const [count, setCount] = createSignal(0)
        return <div onClick={onClick}>{rest.checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1)
  })

  test('no warning with @bf-ignore props-destructuring', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
      }

      // @bf-ignore props-destructuring
      export function Component({ checked }: Props) {
        const [count, setCount] = createSignal(0)
        return <div>{checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(0)
  })

  test('no warning when props object is used', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
      }

      export function Component(props: Props) {
        const [count, setCount] = createSignal(0)
        return <div>{props.checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(0)
  })

  test('no warning when no props parameter', () => {
    const source = `
      'use client'

      export function Component() {
        return <div>Hello</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(0)
  })

  test('warns on arrow function component with destructuring when stateful', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
      }

      export const Component = ({ checked }: Props) => {
        const [count, setCount] = createSignal(0)
        return <div>{checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1)
  })

  test('no warning on arrow function with @bf-ignore', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
      }

      // @bf-ignore props-destructuring
      export const Component = ({ checked }: Props) => {
        const [count, setCount] = createSignal(0)
        return <div>{checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(0)
  })

  test('warns on multiple destructured props in stateful component', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Props {
        checked: boolean
        onChange: () => void
        label: string
      }

      export function Component({ checked, onChange, label }: Props) {
        const [count, setCount] = createSignal(0)
        return <div onClick={onChange}>{label}: {checked}{count()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1) // One warning per component, not per prop
  })

  test('warns when component has memos (stateful)', () => {
    const source = `
      'use client'
      import { createMemo } from '@barefootjs/client'

      interface Props {
        value: number
      }

      export function Component({ value }: Props) {
        const doubled = createMemo(() => value * 2)
        return <div>{doubled()}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1)
  })

  test('warns when component has effects (stateful)', () => {
    const source = `
      'use client'
      import { createEffect } from '@barefootjs/client'

      interface Props {
        value: number
      }

      export function Component({ value }: Props) {
        createEffect(() => console.log(value))
        return <div>{value}</div>
      }
    `

    const ctx = analyzeComponent(source, 'Component.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(1)
  })

  test('no warning on stateless arrow function with destructuring', () => {
    const source = `
      interface Props {
        className: string
        variant: string
      }

      export const Button = ({ className, variant }: Props) => {
        return <button className={className}>{variant}</button>
      }
    `

    const ctx = analyzeComponent(source, 'Button.tsx')

    const propsWarnings = ctx.errors.filter((e) => e.code === ErrorCodes.PROPS_DESTRUCTURING)
    expect(propsWarnings).toHaveLength(0)
  })
})

describe('Destructured props keep their declared types (BF043 fixture #2150)', () => {
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
