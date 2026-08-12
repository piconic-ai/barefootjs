import { createFixture } from '../src/types'

/**
 * `/* @client *​/` twin of `static-array-from-props` (#2321). The base
 * refuses with BF101 on every DSL adapter because `entries` is a
 * function-scope local `const` with a computed initializer
 * (`Object.entries(props.reactions ?? {}).filter(...)`) — no DSL
 * template adapter can bind that as a template variable (see the
 * `renderLoop` comment this fixture's own `unescapable` pin points at
 * in each adapter's `conformance-pins.ts`). Marking the `.map()` call
 * client-only defers the WHOLE loop — including the `entries`
 * computation the loop consumes — to the browser, where a JS runtime
 * (always present client-side) runs the exact same verbatim body.
 *
 * Unlike `map-array-builder-body-client` (#2613), this twin IS a
 * byte-for-byte copy of its base plus the one `/* @client *​/` insertion
 * — checked directly, not assumed. `map-array-builder-body-client`
 * needed to swap its base's prop-sourced array for a signal because the
 * CSR conformance harness's compiled TEMPLATE function referenced the
 * prop directly. Here the entire loop — `entries`'s computation
 * included — is deferred into `init`, so the compiled template function
 * never touches `props.reactions` at all: verified by rendering this
 * exact source (with AND without the base's `props`) through
 * `renderCsrComponent` and getting the identical deferred-loop markup
 * either way. If a future change ever makes the compiler hoist part of
 * that computation back into the template function, this fixture's own
 * CSR conformance test run (not just tier 1 compile-clean) will catch
 * the regression.
 *
 * SSR renders the loop host EMPTY on every backend (Hono included —
 * `isClientOnly` short-circuits the same way a signal-gated
 * `/* @client *​/` would). This does **not** fix #2321: the compiler
 * still cannot lower a props-derived computed const into a DSL template
 * at SSR time — the loop is simply deferred to the browser instead.
 * #2321 stays open as an SSR capability gap; what this fixture proves is
 * that the refusal has a working client-directive escape, not that the
 * gap is closed.
 */
export const fixture = createFixture({
  id: 'static-array-from-props-client',
  description: '/* @client */ twin of static-array-from-props — DSL BF101 (computed-const loop array) suppressed (#2321)',
  source: `
'use client'

type Props = {
  reactions: Record<string, string[]>
}

export function ReactionBar(props: Props) {
  const entries = Object.entries(props.reactions ?? {}).filter(([, users]) => users.length > 0)
  return (
    <div data-reaction-bar="true">
      {/* @client */ entries.map(([emoji, users]) => (
        <button key={emoji} type="button">
          <span>{emoji}</span>
          <span>{String(users.length)}</span>
        </button>
      ))}
    </div>
  )
}
`,
  props: {
    reactions: { '👍': ['alice', 'bob'] },
  },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-reaction-bar="true"></div>
  `,
})
