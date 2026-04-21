/**
 * Regression tests for #942: Solid-style wrap-by-default fallback for
 * prop bindings on child components — `<Card title={expr} />`. Follow-up
 * to #937 (architecture) and #939 (text interpolation pilot).
 *
 * Before this change, `collect-elements.ts` gated `reactiveChildProps`
 * on `hasPropsRef || needsEffectWrapper(...)`. The latter is an
 * allow-list that only recognises known signal getters, memos, and
 * prop parameter names. Any child-component prop expression the
 * analyzer couldn't prove reactive — e.g. `<Card title={formatTitle(
 * page)} />` where `formatTitle` is imported — was silently dropped.
 * At SSR the prop was evaluated once; the child component's DOM stayed
 * frozen at its initial render on the client.
 *
 * The fix adds a third branch to the OR gate: `/\b\w+\s*\(/.test(
 * expandedValue)`. Over-wrap (extra createEffect that subscribes to
 * nothing) is harmless — one closure at init time. Under-wrap is the
 * silent-drop bug we're closing.
 */

import { describe, test, expect } from 'bun:test'
import { compileJSXSync } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

const adapter = new TestAdapter()

function getClientJs(source: string, filename: string): string {
  const result = compileJSXSync(source, filename, { adapter })
  expect(result.errors.filter(e => e.severity === 'error')).toHaveLength(0)
  const clientJs = result.files.find(f => f.type === 'clientJs')
  expect(clientJs).toBeDefined()
  return clientJs!.content
}

describe('Solid-style wrap-by-default fallback for child-component props (#942)', () => {
  test('known signal getter in child prop still wraps (regression guard)', () => {
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Card } from './Card'

      export function Dashboard() {
        const [count, setCount] = createSignal(0)
        return (
          <div onClick={() => setCount(c => c + 1)}>
            <Card title={count()} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Dashboard.tsx')
    // Reactive child props emit a `// Reactive child component props`
    // block containing a createEffect that refreshes the child element's
    // attributes when the signal changes.
    expect(clientJs).toContain('Reactive child component props')
    expect(clientJs).toContain('count()')
  })

  test('unrecognised call in child prop now wraps (new behaviour)', () => {
    // `formatTitle` is an imported helper the analyzer can't prove
    // reactive; `page` is a local const. Before the fix, this was
    // silently dropped from reactiveChildProps. With wrap-by-default the
    // function-call shape alone triggers the fallback.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { formatTitle } from './format'
      import { Card } from './Card'

      export function Dashboard() {
        const [, setFoo] = createSignal(0)
        const page = 'home'
        return (
          <div onClick={() => setFoo(1)}>
            <Card title={formatTitle(page)} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Dashboard.tsx')
    expect(clientJs).toContain('Reactive child component props')
    expect(clientJs).toContain('formatTitle(')
  })

  test('call with no recognised reactive source wraps (harmless over-wrap)', () => {
    // `variantFor(status)` is a pure call: neither signal, memo, nor
    // prop appears. Under wrap-by-default we emit a createEffect that
    // subscribes to nothing and runs exactly once. Cheaper than the
    // silent-drop risk.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { variantFor } from './variants'
      import { Badge } from './Badge'

      export function Label() {
        const [, setFoo] = createSignal(0)
        const status = 'active'
        return (
          <div onClick={() => setFoo(1)}>
            <Badge variant={variantFor(status)} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Label.tsx')
    expect(clientJs).toContain('Reactive child component props')
    expect(clientJs).toContain('variantFor(')
  })

  test('string literal prop stays un-wrapped', () => {
    // Static literal props have attr.dynamic === false and take the
    // `prop.isLiteral` branch of the if/else — they never reach the
    // reactiveChildProps gate at all.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Card } from './Card'

      export function Dashboard() {
        const [, setFoo] = createSignal(0)
        return (
          <div onClick={() => setFoo(1)}>
            <Card title="Static" />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Dashboard.tsx')
    expect(clientJs).not.toContain('Reactive child component props')
  })

  test('bare identifier child prop (no calls, no props ref) stays un-wrapped', () => {
    // `label` is a local const with no function calls and no `props.`
    // reference. None of the three OR branches fires, so no
    // createEffect is emitted for the child prop binding.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Card } from './Card'

      export function Dashboard() {
        const [, setFoo] = createSignal(0)
        const label = 'hi'
        return (
          <div onClick={() => setFoo(1)}>
            <Card title={label} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Dashboard.tsx')
    expect(clientJs).not.toContain('Reactive child component props')
  })

  test('props.xxx access in child prop still wraps (hasPropsRef regression guard)', () => {
    // The existing `hasPropsRef` branch remains — `props.title` is a
    // direct prop reference even though it contains no function call.
    // Ensures the widening didn't accidentally displace the existing
    // path.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Card } from './Card'

      export function Dashboard(props: { title: string }) {
        const [, setFoo] = createSignal(0)
        return (
          <div onClick={() => setFoo(1)}>
            <Card title={props.title} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Dashboard.tsx')
    expect(clientJs).toContain('Reactive child component props')
    // The emitted code rewrites `props.xxx` to the internal props-param
    // name (`_p.xxx`) via rewriteDestructuredPropsInExpr. Assert on the
    // emitted form — the gate's `expandedValue.includes('props.')` check
    // still runs against the source expression before rewriting.
    expect(clientJs).toMatch(/__v\s*=\s*_p\.title/)
  })
})
