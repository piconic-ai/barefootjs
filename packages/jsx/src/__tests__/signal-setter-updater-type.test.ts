/**
 * Regression test for #2573 (chart TS7006 family): the SSR no-op signal
 * setter stub was declared as `(..._args: any[]) => {}`. Calling it with
 * an updater function — `setBars((prev) => [...prev, bar])` — puts that
 * arrow in a rest-`any[]` argument position, not a function-typed one, so
 * TypeScript has no contextual signature to infer the arrow's own
 * parameter from and flags it implicit-any (TS7006). Runtime output
 * (client JS) was always correct; this is a type-level emission defect in
 * the SSR template only.
 *
 * The real `createSignal<T>` setter accepts `T | ((prev: T) => T)`
 * (`packages/client/src/reactive.ts`'s `Signal<T>`). The stub now mirrors
 * that signature whenever the signal's type is known (`SignalInfo.type`,
 * the same field `needsTypeAssertion` already reads for the getter), so
 * the updater arrow's parameter infers from the real element type.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSX } from '../compiler'
import { HonoAdapter } from '../../../../packages/adapter-hono/src/adapter/hono-adapter'

describe('signal setter updater-function typing in emitted templates (#2573)', () => {
  test('a typed signal gets an updater-aware setter stub', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      interface Bar { id: string; height: number }

      export function Chart() {
        const [bars, setBars] = createSignal<Bar[]>([])

        // Called directly from the returned JSX (not from an onXxx handler
        // prop, which SSR stubs to a no-op) so it — and the setter call
        // inside it — stays reachable into the emitted template.
        const addBar = (bar: Bar) => {
          setBars((prev) => [...prev, bar])
          return bars().length
        }

        return <div>{addBar({ id: 'a', height: 1 })}</div>
      }
    `

    const result = compileJSX(source, 'Chart.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain(
      'const setBars: (valueOrFn: Bar[] | ((prev: Bar[]) => Bar[])) => void = () => {}',
    )
  })

  test('a signal with no resolvable type keeps the untyped rest-args stub', () => {
    const honoAdapter = new HonoAdapter()
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'

      export function Widget(props: { initial: unknown }) {
        const [value, setValue] = createSignal(props.initial)

        const reset = () => {
          setValue(props.initial)
          return value()
        }

        return <div>{String(reset())}</div>
      }
    `

    const result = compileJSX(source, 'Widget.tsx', { adapter: honoAdapter })
    expect(result.errors).toHaveLength(0)

    const template = result.files.find((f) => f.type === 'markedTemplate')!
    expect(template).toBeDefined()
    expect(template.content).toContain('const setValue = (..._args: any[]) => {}')
  })
})
