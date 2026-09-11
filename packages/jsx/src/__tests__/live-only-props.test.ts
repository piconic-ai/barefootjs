/**
 * `liveOnlyProps` classification (Move C, Prop Boundary Contract).
 *
 * `computeLiveOnlyProps` (`ir-to-client-js/index.ts`) marks which props the
 * client code CALLS rather than reads, so they cannot arrive as JSON. It
 * only classifies — whether that matters for a given mount is decided at
 * render time by the Hono adapter's gated `serializeHydrationProps` call
 * (`serialize-hydration-props.test.ts` covers that half).
 */

import { describe, test, expect } from 'bun:test'
import { analyzeComponent } from '../analyzer'
import { jsxToIR } from '../jsx-to-ir'
import { buildMetadata } from '../compiler'
import { analyzeClientNeeds } from '../ir-to-client-js'
import type { ComponentIR } from '../types'

function analyze(source: string): ReturnType<typeof analyzeClientNeeds> {
  const ctx = analyzeComponent(source, 'Test.tsx')
  const ir = jsxToIR(ctx)
  expect(ir).not.toBeNull()
  const componentIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx),
    root: ir!,
    errors: [],
  }
  return analyzeClientNeeds(componentIR)
}

describe('liveOnlyProps — fires', () => {
  test('a function-typed prop actually called by client code lands in liveOnlyProps', () => {
    const analysis = analyze(`
      'use client'
      export function Display({ value }: { value: () => number }) {
        return <button onClick={() => console.log(value())}>{value()}</button>
      }
    `)
    expect(analysis.needsInit).toBe(true)
    expect(analysis.usedProps).toContain('value')
    expect(Object.keys(analysis.liveOnlyProps)).toContain('value')
    expect(analysis.liveOnlyProps.value).toBe('() => number')
  })

  test('object-form Function-typed prop actually called by client code also lands in liveOnlyProps', () => {
    const analysis = analyze(`
      'use client'
      export function Foo({ cb }: { cb: Function }) {
        return <button onClick={() => cb()}>go</button>
      }
    `)
    expect(Object.keys(analysis.liveOnlyProps)).toContain('cb')
    expect(analysis.liveOnlyProps.cb).toBe('Function')
  })

  test('renamed destructured prop is keyed by its caller-facing (source) name, not the local binding', () => {
    const analysis = analyze(`
      'use client'
      export function Display({ value: getValue }: { value: () => number }) {
        return <button onClick={() => console.log(getValue())}>go</button>
      }
    `)
    expect(Object.keys(analysis.liveOnlyProps)).toContain('value')
    expect(analysis.liveOnlyProps).not.toHaveProperty('getValue')
  })

  test('an OPTIONAL function-typed prop still resolves (stripUnion drops the undefined arm)', () => {
    const analysis = analyze(`
      'use client'
      export function Display({ value }: { value?: () => number }) {
        return <button onClick={() => console.log(value?.())}>go</button>
      }
    `)
    expect(Object.keys(analysis.liveOnlyProps)).toContain('value')
  })

  test('props-object mode (props.value) resolves the same way', () => {
    const analysis = analyze(`
      'use client'
      export function Display(props: { value: () => number }) {
        return <button onClick={() => console.log(props.value())}>go</button>
      }
    `)
    expect(Object.keys(analysis.liveOnlyProps)).toContain('value')
  })
})

describe('liveOnlyProps — silent', () => {
  test('a function-typed prop declared but never read by client code is not classified', () => {
    // `usedProps` filtering already excludes it upstream (never even
    // reaches the client init), so it can't land in liveOnlyProps either.
    const analysis = analyze(`
      'use client'
      export function Display({ value, label }: { value: () => number; label: string }) {
        return <button onClick={() => console.log(label)}>{label}</button>
      }
    `)
    expect(analysis.usedProps).not.toContain('value')
    expect(analysis.liveOnlyProps).not.toHaveProperty('value')
  })

  test('onClick-shaped (event-handler-convention) prop is excluded even though it is function-typed', () => {
    const analysis = analyze(`
      interface Props { onClick: () => void }
      export function Clickable({ onClick }: Props) {
        return <div onClick={onClick}>Click me</div>
      }
    `)
    expect(analysis.liveOnlyProps).not.toHaveProperty('onClick')
  })

  test('__-prefixed internal prop is excluded even though it is function-typed', () => {
    const analysis = analyze(`
      'use client'
      export function Internal({ __cb }: { __cb: () => void }) {
        return <button onClick={() => __cb()}>go</button>
      }
    `)
    expect(analysis.liveOnlyProps).not.toHaveProperty('__cb')
  })

  test('a non-function-typed prop (number) is never in liveOnlyProps', () => {
    const analysis = analyze(`
      'use client'
      export function Counter({ value }: { value: number }) {
        return <button onClick={() => console.log(value)}>{value}</button>
      }
    `)
    expect(analysis.usedProps).toContain('value')
    expect(analysis.liveOnlyProps).not.toHaveProperty('value')
  })

  test('an ALIASED function type is a known conservative miss, not a classification', () => {
    // `typeNodeToTypeInfo` lowers a named type reference to
    // `{ kind: 'interface', raw: 'Filter' }` with no member walk, so the
    // function shape behind the alias is invisible here and the prop keeps
    // the pre-Move-C silent drop. BF049 has the same blind spot for aliased
    // rich types. Pinned so a future alias-resolution change is a deliberate
    // flip of this expectation, not an accident.
    const analysis = analyze(`
      'use client'
      type Filter = (s: string) => boolean
      export function Display({ filter }: { filter: Filter }) {
        return <button onClick={() => console.log(filter('x'))}>go</button>
      }
    `)
    expect(analysis.usedProps).toContain('filter')
    expect(analysis.liveOnlyProps).not.toHaveProperty('filter')
  })

  test('a static (non-client) component has no clientAnalysis needs at all — liveOnlyProps is empty', () => {
    const analysis = analyze(`
      export function Static({ value }: { value: () => number }) {
        return <span>static</span>
      }
    `)
    expect(analysis.needsInit).toBe(false)
    expect(analysis.liveOnlyProps).toEqual({})
  })
})
