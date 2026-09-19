/**
 * Per-fixture build-time contracts for shapes this adapter intentionally
 * refuses to lower. Declared per adapter, not on the shared fixtures, so
 * adding a new adapter never touches a cross-adapter file. Per-fixture
 * rationale lives on each fixture's docstring
 * (`packages/adapter-tests/fixtures/<id>.ts`) and spec/callback-fidelity.md;
 * comments below only mark where this adapter's set diverges from siblings.
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  'format-date': [{ code: 'BF056', severity: 'error', limitation: 'authored-format-date-call' }],
  'filter-typeof-predicate': [{ code: 'BF021', severity: 'error', limitation: 'off-subset-callback-body' }],
  'map-array-builder-body': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'map-array-builder-escaping': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'fill-unsupported': [{ code: 'BF101', severity: 'error', limitation: 'array-fill' }],
  'find-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'some-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'every-typeof-predicate': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'reduce-typeof-body': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'reduce-right-typeof-body': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  'flatmap-typeof-projection': [{ code: 'BF101', severity: 'error', limitation: 'off-subset-callback-body' }],
  // A pure PROJECTION flatMap body (`flatmap-expression-body`) is NOT pinned —
  // it lowers to neutral nested-loop IR this adapter templatizes natively;
  // only the statement-carrying body refuses.
  'tag-cloud': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  'preamble-cells': [{ code: 'BF021', severity: 'error', limitation: 'statement-body-callback' }],
  // Refused for the COMPUTED loop array (`const entries = Object.entries(...)
  // .filter(...)`), not the destructure param (that lowers, #2087) — loud
  // BF101 instead of silently iterating an unbound name zero times.
  'static-array-from-props': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // No BF103 pin: the harness registers sibling templates (#2205).
  'static-array-from-props-with-component': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // Module-scope companion of `static-array-from-props` above: the const
  // is computed via a function call, not a static literal — genuinely
  // unresolvable at SSR render time, same #2321 design gap applied
  // uniformly regardless of which scope the const lives in (#2946 fixed
  // the STATIC-literal module-scope case; this is the still-open
  // computed-const case). Escape twin: `module-const-loop-source-computed-client`.
  'module-const-loop-source-computed': [
    {
      code: 'BF101',
      severity: 'error',
      limitation: 'computed-const-loop-source',
    },
  ],
  // #2038: `renderFilterExpr`'s `call` arm has no faithful Go form for a
  // nested arrow — loud BF101 instead of the old silent drop of the arrow
  // argument.
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', limitation: 'nested-callback-in-filter-predicate' },
  ],
  'filter-nested-find-predicate': [{ code: 'BF101', severity: 'error', limitation: 'nested-callback-in-filter-predicate' }],
  'date-method-uncatalogued': [{ code: 'BF021', severity: 'error', limitation: 'ambient-locale-date-formatting' }],
  'rich-prop-client-read': [{ code: 'BF049', severity: 'error', limitation: 'rich-typed-prop-hydration' }],
  // A ternary or array literal LITERALLY WRAPPING JSX at a non-children prop
  // position (e.g. `header={cond ? <a/> : <b/>}`) is refused ahead of
  // `adapter.generate()` in the shared jsx-to-ir.ts phase, so it is pinned
  // identically on every adapter (including Hono) — same reasoning as
  // `rich-prop-client-read` above. This is the permanent, intended behavior
  // (formerly tracked as #2667, closed): the issue's own acceptance criteria
  // treated a loud refusal as fully resolving the silent-divergence bug, so
  // no open issue tracks further work here.
  'jsx-element-prop-ternary': [{ code: 'BF021', severity: 'error', limitation: 'jsx-wrapped-in-non-children-prop' }],
  'jsx-element-prop-array': [{ code: 'BF021', severity: 'error', limitation: 'jsx-wrapped-in-non-children-prop' }],
  // `jsx-element-prop-fragment-conditional` (#2703) and
  // `jsx-element-prop-rest-bag-dynamic` (#2805, graduated) are NOT pinned
  // here — both render correctly: `queueDynamicPropDefine`
  // (go-template-adapter.ts) extended the reserved `children` slot's
  // dynamic-delivery route to named jsx-children props, and #2805 further
  // extended it to a prop that routes into the child's rest bag (`bf_with_bag`
  // / `WithBagEntry`, `runtime/bf.go`) rather than a declared field.
  // #2700: a `derived` signal/memo (non-empty free set) seeded from an
  // object literal the constructor-time baker can't reproduce (identifier/
  // member/call operands defer, `parsed-literal-to-go.ts`) now refuses
  // loudly instead of silently keeping the Go zero value — this fixture's
  // `merged().id` / `merged().done` reads are exactly that shape. A working
  // `/* @client */` escape twin exists (`signal-object-spread-init-client`),
  // verified to render correctly, so no `unescapable`.
  'signal-object-spread-init': [{
    code: 'BF101',
    severity: 'error',
    limitation: 'derived-object-literal-signal',
  }],
  // A reactive primitive invoked through a namespace import
  // (`import * as bf from '@barefootjs/client'`, `bf.createSignal(...)`)
  // that the analyzer's checker-less fast path cannot recognize refuses
  // loudly (BF013) instead of silently dropping the declaration — fired
  // in the shared analyzer pass ahead of any adapter's `adapter.generate()`,
  // so all nine adapters (including Hono) pin this identically. A compile
  // that supplies a shared `ts.Program` (e.g. via `@barefootjs/vite`)
  // resolves the primitive normally and never reaches this refusal (formerly
  // tracked as #2771, closed) — no open issue tracks further work.
  'namespace-import-primitive': [{ code: 'BF013', severity: 'error', limitation: 'namespace-import-primitive-without-program' }],
  // #2893's nested-loop STRUCTURAL bail (the whole reason this fixture used
  // to refuse — see #2893's own minimal `static-nested-loop-plain` fixture,
  // which now compiles clean) is fixed: `analyzeBakeableStaticElementLoop`
  // recurses into a nested `loop` node through the same analysis, resolving
  // its array (`item.children`, a member read off the OUTER item) via
  // `evaluateStaticLiteral` against the accumulated outer→inner bindings.
  // This fixture still refuses for a DIFFERENT, narrower reason: its inner
  // row also reads a signal (`count()`) in TEXT position, which
  // `allExpressionsFoldFor`'s plain-`expression` case has no
  // item-independent escape hatch for (unlike a `conditional`'s own
  // condition, #2898's `classifyBakedCondition`) — tracked separately as
  // #2909.
  // A `/* @client */` nested loop inside a static outer loop's row: the
  // static-array bake (`isFoldableTree`) refuses a `clientOnly` loop node
  // and falls through to the generic computed-loop-array BF101.
  'static-loop-client-only-nested': [
    { code: 'BF101', severity: 'error', limitation: 'client-only-loop-in-static-loop' },
  ],
  'static-nested-loop-ref': [{
    code: 'BF101',
    severity: 'error',
    limitation: 'signal-read-in-nested-static-loop',
  }],
  // #2994 graduated the render-divergence pin: a call to a module-scope
  // helper (arrow-valued const OR `function` declaration) by bare name
  // has no Go binding in template scope — `call()`'s generic fallback now
  // refuses it loudly (BF101) instead of emitting a bare struct-field
  // reference (`.Fmt .Label`) that `html/template` fails to evaluate at
  // RENDER time (`can't evaluate field Fmt in type ...`, `go run` exiting
  // non-zero) with no compile-time diagnostic. No verified escape twin
  // exists yet (the shape has no structural lowering — see #2994's
  // "Suggested fix shape" for the deferred, harder direction);
  // `/* @client */` works informally but isn't pinned as a corpus fixture
  // yet.
  'module-const-arrow-helper': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  'module-function-helper-chain': [
    { code: 'BF101', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
  // #3012: the boolean-TEST-position companion of the two entries above —
  // a ternary's `test`, not a plain text position, so it never reaches
  // `call()`'s generic (BF101) fallback at all. `renderConditionExpr`
  // (`go-template-adapter.ts`) is a SEPARATE, dedicated boolean-context
  // expression renderer used only for condition/predicate positions; it
  // already resolves `isValidElement` by identity (registered by name,
  // #2266) ahead of a hard BF102 refusal for every other user-defined
  // predicate call — this adapter never had a `_boolContext`-style
  // structural exemption for the generic case, so it's unaffected by the
  // gap #3012 fixes elsewhere. Permanent by design (`unescapable`):
  // `html/template` cannot evaluate an arbitrary JS predicate
  // server-side, so forcing a result (true or false) is a correctness
  // hazard, not a capability gap to close later.
  'module-helper-boolcontext-call': [
    { code: 'BF102', severity: 'error', limitation: 'module-scope-helper-call', unescapable: true },
  ],
}
