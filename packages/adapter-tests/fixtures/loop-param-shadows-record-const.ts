import { createFixture } from '../src/types'

/**
 * A `.map()` callback param shadowing a module-scope OBJECT-LITERAL
 * const, referenced via property access inside the loop body (#2237 —
 * the record-literal sibling of `loop-param-shadows-const-key`'s
 * primitive-literal case).
 *
 * `_resolveStaticRecordLiteral`-family lookups (`objectName.key` /
 * `objectName['key']` over a module object-literal const, e.g.
 * `variantClasses.ghost`) resolve `objectName` by a flat name lookup
 * against `ir.metadata.localConstants` with no notion of AST scope, so
 * pre-fix EVERY Twig-family adapter inlined the OUTER const's member
 * value even at an occurrence that is actually an enclosing `.map()`
 * callback's own (shadowing) parameter — every iteration rendered the
 * same hard-coded `'outer-lit'` instead of the per-item value. Fixed for
 * Twig, Jinja, Blade, Xslate, and Rust (minijinja) by guarding the
 * lookup against `staticLoopSourceBoundNames` (same coarse exclusion
 * #2221 established for the primitive-const case); Mojolicious was
 * already immune (its resolver consults the live, scope-precise
 * `loopBoundNames` map, #1749).
 *
 * Deliberately NO outside-the-loop reference to `cfg` (same rationale as
 * `loop-param-shadows-const-key`): the Twig family's coarse guard
 * suppresses inlining for a loop-bound name at non-shadowed occurrences
 * too, which is an accepted per-adapter trade-off pinned by the #2237
 * unit tests, not something this fixture should force a divergence
 * declaration for.
 *
 * KNOWN GO GAP (untracked, not declared here): Go's equivalent lookup —
 * `resolveStaticRecordLiteralIndex` in `go-template-adapter.ts`, which
 * covers BOTH the bracket-string-literal and property-access forms of
 * this same pattern — was NOT touched by #2237 (whose fix only shipped
 * for the five template-string adapters above) and is a genuinely
 * separate code path from the bare-identifier `isLoopShadowed` guard
 * Go's own #2236/#2242 fixes hardened. Adding this fixture exposed it:
 * the emitted `markedTemplate` baked `{{"outer-lit"}}` into the loop
 * body regardless of the range item. FIXED in the same PR that added
 * this fixture (PR #2246): `resolveStaticRecordLiteralIndex` now guards
 * via the shared `isLoopShadowedName`, so Go renders each row's own `x`
 * at reference parity like every other adapter — no divergence
 * declaration needed.
 */
export const fixture = createFixture({
  id: 'loop-param-shadows-record-const',
  description: '.map() callback param shadows a module-scope object-literal const, read via property access inside the loop (#2237)',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

const cfg = { x: 'outer-lit' }

export function LoopParamShadowsRecordConst({ rows }: { rows: { id: number; x: string }[] }) {
  const [n, setN] = createSignal(0)
  return (
    <div data-n={n()} onClick={() => setN(n() + 1)}>
      <ul>
        {rows.map((cfg) => (
          <li key={cfg.id}>{cfg.x}</li>
        ))}
      </ul>
    </div>
  )
}
`,
  props: { rows: [{ id: 1, x: 'alpha' }, { id: 2, x: 'beta' }] },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-n="0"><ul bf="s1"><li data-key="1"><!--bf:s0-->alpha<!--/--></li><li data-key="2"><!--bf:s0-->beta<!--/--></li></ul></div>
  `,
})
