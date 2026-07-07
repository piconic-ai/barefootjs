/**
 * Per-fixture build-time contracts for shapes the Go template adapter
 * intentionally refuses to lower. Lives here (not on the shared fixtures)
 * so adding a new adapter doesn't require touching any cross-adapter
 * file — every adapter declares its own refusal set against the
 * canonical fixture corpus. Consumed by this package's own conformance
 * test (as `expectedDiagnostics`) and by `bf compat` (issue-URL
 * attribution).
 */

import type { ConformancePins } from '@barefootjs/jsx'

export const conformancePins: ConformancePins = {
  // `style-object-dynamic` / `style-3-signals` no longer pinned — a
  // `style={{ … }}` object literal now lowers to a CSS string with dynamic
  // values interpolated (`background-color:{{.Color}};padding:8px`) via
  // `tryLowerStyleObject` (#1322).
  // Sibling-imported child component inside a loop body: the adapter
  // emits `{{template "X" .}}` which only resolves if the user has
  // compiled the sibling file and registered the template on the
  // same instance. BF103 makes that requirement loud. (The barefoot
  // CLI passes `siblingTemplatesRegistered: true` so CLI builds
  // suppress the diagnostic — see compileJSX `siblingTemplatesRegistered`.)
  'static-array-children': [{ code: 'BF103', severity: 'error' }],
  // TodoApp / TodoAppSSR import `TodoItem` from a sibling file and
  // call it inside a keyed `.map`. Same BF103 surface as
  // `static-array-children` above — pinned at adapter level so the
  // shared-component corpus stays adapter-neutral.
  'todo-app': [{ code: 'BF103', severity: 'error' }],
  'todo-app-ssr': [{ code: 'BF103', severity: 'error' }],
  // `([emoji, users]) => ...` is an array-index tuple destructure — #2087
  // Phase B's widened gate now admits this shape (`destructure-array-index-in-map`
  // exercises the same `segments`-based lowering). The remaining refusal here
  // is orthogonal: `entries` is a function-scope local const with a computed
  // initializer (`Object.entries(props.reactions ?? {}).filter(...)`) that
  // the Go adapter has no binding for (only a STRING-derived local resolves
  // to a generated struct field, via `computeDerivedConstFields`/`isStringExpr`)
  // — left unchecked this would silently execute-time-fail instead of
  // building loud, so `renderLoop` raises BF101 for a bare-identifier loop
  // array bound to such a const. See the `renderLoop` comment at the check
  // site; Jinja / ERB apply the same narrow check for the same reason.
  'static-array-from-props': [{ code: 'BF101', severity: 'error' }],
  // Same computed-const array as above, plus the pre-existing BF103 (a
  // sibling-imported child component used inside the loop body) — the
  // destructure param itself no longer contributes a diagnostic.
  'static-array-from-props-with-component': [
    { code: 'BF103', severity: 'error' },
    { code: 'BF101', severity: 'error' },
  ],
  // (`style-3-signals` graduated alongside `style-object-dynamic` — see note
  // above; the `style={{ … }}` object now lowers to a CSS string.)
  // (`tagged-template-classname` graduated by #2092 — the tag resolves
  // through the interleave-tag catalogue and desugars to an untagged
  // template literal, so it lowers like any other className template.)
  // #2038: a filter predicate whose body contains a NESTED callback call
  // (`t => !picked().some(p => …)` / `t => picked().find(p => …)`). The
  // evaluator refuses nested arrows and `renderFilterExpr` has no faithful
  // Go form for the inner call (its `call` arm used to silently drop the
  // arrow argument and render only the callee) — the compiler is loud
  // instead of lossy. The `/* @client */` twin
  // (`filter-nested-callback-predicate-client`) has no pin here: it must
  // render clean on every adapter, which asserts the suppression contract.
  // https://github.com/piconic-ai/barefootjs/issues/2038
  'filter-nested-callback-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2038' },
  ],
  'filter-nested-find-predicate': [
    { code: 'BF101', severity: 'error', issue: 'https://github.com/piconic-ai/barefootjs/issues/2038' },
  ],
  // #1310 / #2087: rest destructure in .map() callback. `isLowerableLoopDestructure`
  // now admits every shape this fixture family exercises — each fixed/rest
  // binding resolves via `buildSegmentAccessor`/`buildDestructureBindingMap`
  // against a synthetic `$__bf_item0` range var (the reserved `__bf_item`
  // name, depth-suffixed): a plain field → `$__bf_item0.Id`, an array-index
  // step → `(index $__bf_item0 0)`, an array-rest → `(bf_slice $__bf_item0
  // 1)` (composes under `.length` via `member()`'s generic `len <obj>` arm),
  // and an object-rest member read (`rest.flag`) → `$__bf_item0.Flag`. A
  // `{...rest}` SPREAD (`rest-destructure-object-spread-in-map`) routes
  // through the new `bf_omit` runtime helper instead, so the residual omits
  // exactly the sibling keys the pattern destructured out. No fixture in
  // this family is pinned anymore — all six render to real Go / byte-exact
  // HTML (`rest-destructure-object-in-map`, `rest-destructure-object-spread-in-map`,
  // `rest-destructure-array-in-map`, `rest-destructure-nested-in-map`,
  // `destructure-array-index-in-map`, `destructure-nested-object-in-map`).
  // #1443: `[a, b].filter(Boolean).join(' ')` (registry Slot) now
  // lowers to `bf_join (bf_filter_truthy (bf_arr ...)) " "`. No
  // BF101 expected — pinned positively by the
  // `branch-local-filter-join-go` template-output test below.
  //
  // #1448 Tier A — JS Array / String methods that the Go template
  // adapter hasn't lowered yet. Each row drops once the
  // corresponding method PR lands. Hono / CSR pass these out of
  // the box (they evaluate JS at runtime) so the pin only applies
  // here.
  //
  // `array-includes` / `string-includes` no longer pinned — both
  // shapes lower via the shared `array-method` IR + the polymorphic
  // `bf_includes` runtime helper that dispatches on
  // `reflect.Kind()` (slice/array → element search, string →
  // substring search). The condition-position lowering picks up
  // the same emit through the `array-method` arm of
  // `renderConditionExpr` (#1448 Tier A first PR).
  //
  // Remaining fixtures land at expression position and surface BF101
  // via `convertExpressionToGo`. Distinct codes for the two paths is
  // pre-existing adapter behaviour, not something this catalog
  // should paper over — pinned literally here.
  // `array-indexOf` / `array-lastIndexOf` no longer pinned —
  // value-equality `bf_index_of` / `bf_last_index_of` Go runtime
  // helpers handle the shape (#1448 Tier A second PR).
  // `array-at` no longer pinned — the pre-existing `bf_at` runtime
  // helper now lowers `.at(i)` (#1448 Tier A third PR).
  // `array-concat` no longer pinned — the new `bf_concat` runtime
  // helper merges two arrays into a single `[]any` (#1448 Tier A
  // fourth PR).
  // `array-slice` no longer pinned — the new `bf_slice` runtime
  // helper carves out a sub-range with JS-compat clamping
  // (#1448 Tier A fifth PR).
  // `array-reverse` / `array-toReversed` no longer pinned —
  // both share the `bf_reverse` helper since SSR templates
  // render a snapshot and the JS mutate-vs-new distinction has
  // no template-level meaning (#1448 Tier A sixth PR).
  // `string-toLowerCase` / `string-toUpperCase` no longer pinned —
  // pre-existing `bf_lower` / `bf_upper` runtime helpers wire to
  // the JS method names at the adapter layer (#1448 Tier A
  // seventh + eighth PRs).
  // `string-trim` no longer pinned — pre-existing `bf_trim`
  // (wraps `strings.TrimSpace`) handles the strip (#1448 Tier A
  // ninth PR, closing out Tier A).
  // #2073 follow-up: a function-reference `.map(format)` callback has no
  // arrow body to serialize — not a CALLBACK_METHODS shape — so the
  // UNSUPPORTED_METHODS gate refuses it with BF101 rather than emitting
  // a broken template.
  'array-map-function-reference': [{ code: 'BF101', severity: 'error' }],
  // Edge-case sweep (Priority 12): `dangerouslySetInnerHTML` requires a
  // deliberate raw-HTML (unescaped) output affordance in the target
  // template language. No lowering exists yet, so the compiler refuses
  // the shape loudly instead of emitting entity-escaped markup that
  // silently renders tags as text.
  'dangerous-inner-html': [{ code: 'BF101', severity: 'error' }],
  // Edge-case sweep (Priority 12): `.replaceAll` has no lowering yet —
  // only first-occurrence `.replace` is wired to the runtime helpers.
  // Refused with BF101 rather than reusing the first-only lowering,
  // which would silently change semantics.
  'string-replaceall': [{ code: 'BF101', severity: 'error' }],
}
