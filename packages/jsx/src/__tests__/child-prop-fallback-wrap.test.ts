/**
 * Regression tests for #942: Solid-style wrap-by-default fallback for
 * prop bindings on child components — `<Card title={expr} />`. Follow-up
 * to #937 (architecture) and #939 (text interpolation pilot).
 *
 * Before #942, `collect-elements.ts` gated `reactiveChildProps` on
 * `hasPropsRef || needsEffectWrapper(...)`. The latter is an allow-list
 * that only recognises known signal getters, memos, and prop parameter
 * names. Any child-component prop expression the analyzer couldn't
 * prove reactive — e.g. `<Card title={formatTitle(page)} />` where
 * `formatTitle` is imported — was silently dropped. At SSR the prop was
 * evaluated once; the child component's DOM stayed frozen at its
 * initial render on the client.
 *
 * #942 originally closed this by adding a third branch to the OR gate:
 * `/\b\w+\s*\(/.test(expandedValue)` with string-literal stripping to
 * avoid false matches on `{ color: 'hsl(...)' }`. #952 then
 * DRY-consolidated #942 into the same AST-flag shape that #939 / #941
 * / #943 already used: the gate now reads
 * `prop.callsReactiveGetters || prop.hasFunctionCalls` and both flags
 * are computed Phase 1 over the prop's source AST expression — no
 * post-expansion string scan, no string-strip workaround. Over-wrap
 * (extra createEffect that subscribes to nothing) stays harmless;
 * under-wrap (silent drop of a reactive read in a child prop) stays
 * the class of bug we're closing.
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

  test('string-literal-only function-like pattern stays un-wrapped (AST-flag structural check, #942 DRY)', () => {
    // Before #942 DRY consolidation, collect-elements.ts scanned the
    // expanded expression text with /\b\w+\s*\(/ after stripping quoted
    // strings. Structural regex over stripped text is still a regex —
    // any future regression in the strip step would silently re-introduce
    // hsl/rgb/url/etc. false positives. The AST flag approach can't be
    // fooled this way: `{ color: 'hsl(221 83% 53%)' }` is an object
    // literal with a StringLiteral value, not a CallExpression, so
    // `hasFunctionCalls` is structurally false.
    //
    // The enclosing expression has no reactive source (no signal, no
    // memo, no `props.`), so none of the OR branches should fire and the
    // prop must NOT appear in reactiveChildProps.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { Card } from './Card'

      export function Palette() {
        const [, setFoo] = createSignal(0)
        return (
          <div onClick={() => setFoo(1)}>
            <Card config={{ color: 'hsl(221 83% 53%)' }} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Palette.tsx')
    expect(clientJs).not.toContain('Reactive child component props')
  })

  test('local-const arrow binding stays un-wrapped (#952 source-level vs post-expansion guard)', () => {
    // #952 replaced the post-expansion regex gate with AST flags computed
    // on the prop's source expression. This changes behaviour for a
    // specific shape that the fixture sweep surfaced empirically but no
    // unit test locked in: a child-component prop whose value is a bare
    // identifier bound to a local const whose initializer contains a
    // call or constructor.
    //
    // Source: `<DatePicker formatDate={fmtDate} />` where
    // `const fmtDate = (d) => d.toLocaleDateString(...)`. The #942 regex
    // expanded `fmtDate` first, then matched `toLocaleDateString(` on
    // the expansion — forcing wrap. The #952 AST flags see only the
    // source identifier `fmtDate` (no CallExpression), so
    // `hasFunctionCalls` is false and the prop stays un-wrapped. That is
    // the correct semantic under #937: wrap based on what the prop's
    // source expression *does*, not on what its transitive inlining
    // happens to contain. The child component still receives the
    // function value once via `initChild`'s `get formatDate()` property.
    const source = `
      'use client'
      import { createSignal } from '@barefootjs/client'
      import { DatePicker } from './DatePicker'

      export function Form() {
        const [, setFoo] = createSignal(0)
        const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
        return (
          <div onClick={() => setFoo(1)}>
            <DatePicker formatDate={fmtDate} />
          </div>
        )
      }
    `

    const clientJs = getClientJs(source, 'Form.tsx')
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
