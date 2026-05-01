/**
 * Pins the ref-binding emit shape for `<el ref={...}>`.
 *
 * #1161: when `ref={props.someRef}` and `someRef?:` is optional, consumers
 * may omit the prop, in which case `_p.someRef` is `undefined` and the
 * emitted call `(_p.someRef)(_s0)` throws `TypeError: ... is not a function`.
 *
 * Fix: emit optional-call (`?.()`) for prop-access ref bindings so an
 * undefined prop degrades to a no-op. Local-bound refs (a `const` arrow in
 * the component body) keep the unguarded call — the function is always
 * defined there.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

describe('ref={...} emit shape (#1161)', () => {
  test('ref={props.optionalRef} emits an optional-call guard', () => {
    const source = `
      'use client'
      interface Props {
        someRef?: (el: HTMLElement) => void
      }
      export function Foo(props: Props) {
        return <div ref={props.someRef} />
      }
    `

    const result = compileJSXSync(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // Optional-call form: `(_p.someRef)?.(_s0)` — undefined prop no-ops.
    expect(content).toMatch(/\(_p\.someRef\)\?\.\(_s0\)/)

    // The unguarded `(_p.someRef)(_s` form must NOT appear — it's the
    // exact pattern that throws when the consumer omits the ref.
    expect(content).not.toMatch(/\(_p\.someRef\)\(_s/)
  })

  test('ref={props.requiredRef} also emits an optional-call guard', () => {
    // Even when the prop type marks `ref` as required, the emit still
    // guards with `?.()`. Rationale: prop-access could resolve to
    // undefined at runtime regardless of the source typing (consumers
    // can pass `as any`, the type can drift, …). The guard mirrors the
    // way callable handlers like `onClick={props.onClick}` typically
    // degrade to no-op when the prop is missing.
    const source = `
      'use client'
      interface Props {
        someRef: (el: HTMLElement) => void
      }
      export function Foo(props: Props) {
        return <div ref={props.someRef} />
      }
    `

    const result = compileJSXSync(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    expect(content).toMatch(/\(_p\.someRef\)\?\.\(_s0\)/)
    expect(content).not.toMatch(/\(_p\.someRef\)\(_s/)
  })

  test('ref={localFn} where localFn is a const in the component body stays unguarded', () => {
    // A bare-identifier callback resolves to a local binding declared in
    // the component body — it is always defined. Keep the unguarded call
    // so a typo / dead binding fails loud instead of silently no-op'ing.
    const source = `
      'use client'
      export function Foo() {
        const attachPane = (el: HTMLElement) => { void el }
        return <div ref={attachPane} />
      }
    `

    const result = compileJSXSync(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    // Unguarded form: `(attachPane)(_s0)`.
    expect(content).toMatch(/\(attachPane\)\(_s0\)/)
    // No optional-call sneaking in for the local binding.
    expect(content).not.toMatch(/\(attachPane\)\?\.\(/)
  })

  test('ref={props.someRef} inside a conditional branch is also guarded', () => {
    // The conditional-branch insert path has its own ref emitter; this
    // test pins that it agrees with the top-level emitter on guarding
    // prop-access callbacks. Without the fix, `<el ref={props.someRef}>`
    // inside a conditional branch would still throw on the first show.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      interface Props {
        someRef?: (el: HTMLElement) => void
      }
      export function Foo(props: Props) {
        const [show] = createSignal(true)
        return <>{show() ? <div ref={props.someRef} /> : <span />}</>
      }
    `

    const result = compileJSXSync(source, 'Foo.tsx', { adapter })
    expect(result.errors).toHaveLength(0)
    const clientJs = result.files.find((f) => f.type === 'clientJs')
    const content = clientJs?.content ?? ''

    expect(content).toMatch(/\(_p\.someRef\)\?\.\(/)
    expect(content).not.toMatch(/\(_p\.someRef\)\(_s/)
  })
})
