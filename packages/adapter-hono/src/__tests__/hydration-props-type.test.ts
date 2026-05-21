// Hydration-only synthetic props (`__bfParent`, `__bfMount`,
// `__bfParentProps`, `data-key`) are destructured into every generated
// SSR template, so the function parameter's type annotation has to
// declare them — otherwise tsc reports TS2339 ("Property '__bfParent'
// does not exist on type {…}") across the emitted SSR templates the
// moment a user runs `tsc --noEmit` or opens the project in an IDE.
//
// Pins the codegen contract that:
//
//   - The annotation always carries the full hydration-props set,
//     regardless of whether the user declared a Props type, used
//     destructured-props, or wrote `function X()` with no parameters.
//
// Round 5 / PR #1450: before this fix the destructured-no-Props branch
// declared only `{ __instanceId?; __bfScope?; __bfChild? }`, and any
// scaffolded `function Counter()`-style component produced ~6 tsc
// errors per emitted file.

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '@barefootjs/jsx'
import { HonoAdapter } from '../adapter'

const adapter = new HonoAdapter()

// The four hydration fields the generated body destructures BEYOND the
// pre-existing `__instanceId / __bfScope / __bfChild`.
const HYDRATION_FIELDS = [
  '__bfParentProps?: string',
  '__bfParent?: string',
  '__bfMount?: string',
  '"data-key"?: string | number',
] as const

function compileMarkedTemplate(source: string, file = 'Demo.tsx'): string {
  const result = compileJSX(source, file, { adapter })
  const errors = result.errors.filter((e) => e.severity === 'error')
  expect(errors).toEqual([])
  const tmpl = result.files.find((f) => f.type === 'markedTemplate')
  expect(tmpl).toBeDefined()
  return tmpl!.content
}

describe('Hono adapter — type alias preservation (#1453)', () => {
  test('seeds reachability from `propsTypeName` so the destructured-props alias carries it', () => {
    // `${Name}PropsWithHydration = ${propsTypeName} & {…}` is emitted
    // AFTER the component body is scanned for typedef references, so a
    // body that only mentions `ButtonPropsWithHydration` would not pull
    // in `ButtonProps`. Without the alias-aware seed, every emitted
    // Button-shape (the scaffold's onboarding component) raises TS2304
    // for the very type it documents.
    const source = `'use client'
interface ButtonProps { variant?: 'a' | 'b' }
export function Button({ variant }: ButtonProps) {
  return <button>{variant}</button>
}`
    const tmpl = compileMarkedTemplate(source, 'Button.tsx')
    expect(tmpl).toContain('interface ButtonProps')
    expect(tmpl).toContain('type ButtonPropsWithHydration = ButtonProps &')
  })

  test('pulls in types reached transitively from the seed', () => {
    // `ButtonProps` references `ButtonVariant`; once `ButtonProps` is
    // seeded by `propsTypeName`, the transitive closure must include
    // `ButtonVariant` too — otherwise `[variant]` lookups raise TS7053
    // because `variant` widens to `any`.
    const source = `'use client'
type ButtonVariant = 'default' | 'destructive'
interface ButtonProps { variant?: ButtonVariant }
export function Button({ variant = 'default' }: ButtonProps) {
  return <button>{variant}</button>
}`
    const tmpl = compileMarkedTemplate(source, 'Button.tsx')
    expect(tmpl).toContain("type ButtonVariant = 'default' | 'destructive'")
    expect(tmpl).toContain('interface ButtonProps')
  })

  test('carries forward declarations referenced by named re-exports', () => {
    // `export type { ButtonVariant }` requires `ButtonVariant` to be
    // declared locally. Even if the component body never mentions
    // `ButtonVariant`, the re-export ties it to the public surface.
    const source = `'use client'
type ButtonVariant = 'default' | 'destructive'
export function Button() {
  return <button />
}
export type { ButtonVariant }`
    const tmpl = compileMarkedTemplate(source, 'Button.tsx')
    expect(tmpl).toContain("type ButtonVariant = 'default' | 'destructive'")
    expect(tmpl).toContain('export type { ButtonVariant }')
  })
})

describe('Hono adapter — hydration-props type annotation', () => {
  test('parameterless client component declares the full hydration-props type', () => {
    // The scaffolded TodoList / "no props" shape — most common case for
    // a brand-new user. This is the path that used to slip through the
    // narrow `{ __instanceId; __bfScope; __bfChild }` fallback.
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
export function NoProps() {
  const [v, setV] = createSignal(0)
  return <button onClick={() => setV(v() + 1)}>{v()}</button>
}`
    const tmpl = compileMarkedTemplate(source, 'NoProps.tsx')
    for (const field of HYDRATION_FIELDS) {
      expect(tmpl).toContain(field)
    }
  })

  test('destructured-props pattern with a Props type uses the `<Name>PropsWithHydration` alias', () => {
    // The alias is declared at the top of the file with every hydration
    // field. Pin its presence so a regression in `generateTypeDeclarations`
    // doesn't silently strip the synth fields.
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
interface Props { initial: number }
export function Counter({ initial }: Props) {
  const [v, setV] = createSignal(initial)
  return <button onClick={() => setV(v() + 1)}>{v()}</button>
}`
    const tmpl = compileMarkedTemplate(source, 'Counter.tsx')
    expect(tmpl).toContain('type CounterPropsWithHydration = Props & {')
    for (const field of HYDRATION_FIELDS) {
      expect(tmpl).toContain(field)
    }
  })

  test('SolidJS-style props=Props pattern carries hydration fields inline', () => {
    const source = `'use client'
import { createSignal } from '@barefootjs/client'
interface Props { initial: number }
export function Counter(props: Props) {
  const [v, setV] = createSignal(props.initial)
  return <button onClick={() => setV(v() + 1)}>{v()}</button>
}`
    const tmpl = compileMarkedTemplate(source, 'Counter.tsx')
    for (const field of HYDRATION_FIELDS) {
      expect(tmpl).toContain(field)
    }
  })
})
