/**
 * RENDER-stage cross-adapter conformance contract (#2158).
 *
 * `runAdapterConformanceTests` (and the compile matrix it drives) proves a
 * fixture *compiles clean* — the adapter accepts the JSX shape and emits a
 * template with no diagnostics. The 0.17–0.18 review found that every
 * shipped adapter bug was invisible at that layer: the compile matrix read
 * 496/496 clean while Ruby's `derive_vars_from_defaults` silently dropped
 * every manifest-registered child's `children` prop (#2157), rendering
 * `<button class="btn btn-increment"></button>` with the label gone —
 * a bug that only a real backend *executing* the template surfaces.
 * "compile-clean ≠ renders-correctly."
 *
 * This module is the render-stage counterpart: a fixed fixture
 * (`renderContractFixture`) and a fixed set of assertions
 * (`assertRenderContract`) that every adapter runs its OWN render pipeline
 * against — real Go binary, real Ruby `erb`, real Python `jinja2`, etc. —
 * so the same five checks catch the same class of bug on every backend.
 *
 * Contract v1 checks (see `assertRenderContract` for the authoritative
 * list): SSR of the initial signal value, non-empty child-component
 * slots, hydration marker presence, absence of backend error markers, and
 * a non-empty rendered body. Each failure message is prefixed with the
 * check's id (mirrors `scaffold.contract.ts`'s step-naming convention) so
 * a regression names the contract surface, not just a stack trace.
 *
 * Full-page concerns (script-tag registration, asset manifest wiring, a
 * real HTTP round-trip) are explicitly OUT of scope here — those belong
 * to a future integration-server harness that boots each adapter's real
 * app. This contract only asserts what a single component render call
 * produces.
 */

import { expect } from 'bun:test'

/**
 * Decode the small set of HTML character references that legitimately
 * differ between backends but must be treated as equivalent rendered
 * text.
 *
 * Go's `html/template` contextual auto-escaper emits `+` as the numeric
 * reference `&#43;` in several contexts, while Hono/ERB/Jinja/etc. emit
 * the literal character — a real encoding divergence, not a bug, so a
 * byte-for-byte string comparison must not flag it (#2158). Handles:
 *   - numeric decimal (`&#43;`) and hex (`&#x2B;`) references
 *   - the standard named entities: `&amp;` `&lt;` `&gt;` `&quot;`
 *     `&#39;` / `&apos;` `&nbsp;`
 *
 * There is prior art for numeric-entity handling in this package's
 * `bf-p` JSON-attribute decoder around `src/jsx-runner.ts:509`; this
 * function generalizes that one-off (decimal-only, no hex, no named
 * entities beyond a handful) into a reusable, fully-named-entity-aware
 * decoder for whole-document text comparisons.
 *
 * `&amp;` is intentionally decoded LAST: an already-decoded `&amp;lt;`
 * (representing the literal text `&lt;`) must not be re-decoded into
 * `<` by a subsequent `&lt;` pass.
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

/** Strip HTML comments — template-detail markers (loop boundaries, scope
 *  init, conditional branch pairs) that differ by adapter and carry no
 *  user-visible text. All text comparisons below run on comment-stripped
 *  output so those differences never cause a false contract failure. */
function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

/** Strip all tags, leaving bare text content. Caller strips comments first
 *  (comments can themselves contain `<`/`>`-shaped text unrelated to real
 *  markup). */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '')
}

/**
 * The shared fixture every adapter renders through its own real backend
 * for the render-stage contract. Mirrors the stock `Counter` fixture
 * (`fixtures/counter-shared.ts`, lifted from
 * `integrations/shared/components/Counter.tsx`) plus the `<Button>`
 * children-forwarding shape from the #2157 reproduction app — the exact
 * shape whose children rendered EMPTY on Ruby before that fix, because
 * that bug only manifests through a manifest-registered child renderer
 * exercising `derive_vars_from_defaults`, not through inline SSR.
 *
 * `props.__instanceId` pins the deterministic root scope id
 * (`Counter_test`) so `assertRenderContract`'s hydration-marker check can
 * assert an exact root scope and a family of child scopes without any
 * adapter-specific normalization.
 */
export const renderContractFixture = {
  componentName: 'Counter',
  props: { __instanceId: 'Counter_test' } as Record<string, unknown>,
  source: `
'use client'
import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from './button'

export function Counter() {
  const [count, setCount] = createSignal(0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter-container">
      <p className="counter-value">{count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <Button className="btn-increment" onClick={() => setCount(n => n + 1)}>+1</Button>
        <Button className="btn-decrement" onClick={() => setCount(n => n - 1)}>-1</Button>
        <Button className="btn-reset" onClick={() => setCount(0)}>Reset</Button>
      </div>
    </div>
  )
}
`,
  components: {
    './button.tsx': `
export function Button({ children, className = '', onClick }: { children?: unknown; className?: string; onClick?: () => void }) {
  return <button className={'btn ' + className} onClick={onClick}>{children}</button>
}
`,
  },
}

/**
 * Assert that a rendered HTML string satisfies the render-stage contract
 * (Contract v1). Call from each adapter's own render call:
 *
 *   const html = await renderXComponent({ adapter, ...renderContractFixture })
 *   assertRenderContract(html)
 *
 * Each check's failure message is prefixed with its id so a regression
 * names the contract surface directly:
 *
 *   1. `counter-ssr-initial`         — `.counter-value` SSRs the initial
 *      signal value exactly (`0`), not blank and not `NaN`.
 *   2. `child-slot-children-nonempty` — `+1` / `-1` / `Reset` all appear
 *      as rendered text, and every `<button>` element's text content is
 *      non-empty. This is the #2157 regression pin: Ruby 0.18.0 rendered
 *      `<button class="btn btn-increment"></button>` — compiled clean,
 *      rendered wrong.
 *   3. `hydration-markers-present`   — the root hydration scope
 *      `bf-s="Counter_test"` appears exactly once, and at least three
 *      child scopes matching `bf-s="Counter_test_s<N>"` are present (one
 *      per `<Button>` slot). Full-page script-registration checks (the
 *      `bf.register_script(...)` family) are explicitly out of scope —
 *      they belong to a future integration-server harness that boots a
 *      real app, not this single-render contract.
 *   4. `no-render-error-marker`      — case-insensitive absence of common
 *      backend failure signatures: "template error", "no renderer
 *      registered", "can't evaluate field", "server error", "traceback
 *      (most recent call last)".
 *   5. `nonempty-body`               — after stripping tags/comments and
 *      decoding entities, some visible text remains (guards the silent
 *      empty-200 failure class, where a template error is swallowed and
 *      the backend returns an empty but "successful" response).
 */
export function assertRenderContract(html: string): void {
  const clean = decodeHtmlEntities(stripHtmlComments(html))

  // 1. counter-ssr-initial
  const counterValueMatch = clean.match(
    /<([a-zA-Z][\w-]*)\b[^>]*\bclass="[^"]*\bcounter-value\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/,
  )
  expect(
    counterValueMatch,
    '[counter-ssr-initial] no element with class "counter-value" found in rendered HTML',
  ).toBeTruthy()
  const counterValueText = stripTags(counterValueMatch![2]).trim()
  expect(
    counterValueText,
    `[counter-ssr-initial] .counter-value must SSR the initial signal value "0" exactly (not blank, not NaN); got "${counterValueText}"`,
  ).toBe('0')

  // 2. child-slot-children-nonempty
  for (const label of ['+1', '-1', 'Reset']) {
    expect(
      clean,
      `[child-slot-children-nonempty] expected rendered text "${label}" not found in output`,
    ).toContain(label)
  }
  const buttonMatches = [...clean.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)]
  expect(
    buttonMatches.length,
    '[child-slot-children-nonempty] expected at least one <button> element in rendered output',
  ).toBeGreaterThan(0)
  for (const [, inner] of buttonMatches) {
    const text = stripTags(inner).trim()
    expect(
      text,
      '[child-slot-children-nonempty] a <button> rendered with empty text content — the #2157 class of bug (Ruby 0.18.0 dropped child slot children)',
    ).not.toBe('')
  }

  // 3. hydration-markers-present
  // Works on the raw (undecoded, comments intact) HTML — these are
  // attribute matches, not text comparisons.
  const rootScopeMatches = html.match(/bf-s="Counter_test"/g) ?? []
  expect(
    rootScopeMatches.length,
    `[hydration-markers-present] expected exactly one root bf-s="Counter_test"; found ${rootScopeMatches.length}`,
  ).toBe(1)
  const childScopeMatches = html.match(/bf-s="Counter_test_s\d+"/g) ?? []
  expect(
    childScopeMatches.length,
    `[hydration-markers-present] expected at least 3 child bf-s="Counter_test_s..." scopes (one per Button slot); found ${childScopeMatches.length}`,
  ).toBeGreaterThanOrEqual(3)
  // Full-page script-registration checks (bf.register_script(...) and
  // friends) intentionally are NOT asserted here — they belong to a
  // future integration-server harness that renders a whole page through
  // a real running app, not this single-component render contract.

  // 4. no-render-error-marker
  const lower = clean.toLowerCase()
  const errorMarkers = [
    'template error',
    'no renderer registered',
    "can't evaluate field",
    'server error',
    'traceback (most recent call last)',
  ]
  for (const marker of errorMarkers) {
    expect(
      lower,
      `[no-render-error-marker] found backend error marker "${marker}" in rendered output`,
    ).not.toContain(marker)
  }

  // 5. nonempty-body
  const bodyText = stripTags(clean).trim()
  expect(
    bodyText,
    '[nonempty-body] rendered output has no visible text content — guards the silent empty-200 failure class',
  ).not.toBe('')
}
