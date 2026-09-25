/**
 * Fixtures excluded from `csr-conformance.test.ts` (#2613). Extracted to
 * its own module so `packages/compat`'s escape-coverage tier-2 check reads
 * the same set without the two silently drifting apart.
 */
export const CSR_SKIP_FIXTURES: ReadonlySet<string> = new Set([
  // #2073 graduated by #2988: `format` (a module-scope arrow-valued const
  // with no free identifiers beyond its own param) is now classified
  // `module-scope-safe` by `compute-inlinability.ts` instead of the old
  // unconditional `arrow-literal` — so it's no longer in `unsafeLocalNames`,
  // and the containing `{tags.map(format).join(' ')}` template expression's
  // whole-expression safety check (which saw the bare word `format` in the
  // source text, independent of `resolveCallbackMethodFunctionReferences`'s
  // structural splice of the callback body) no longer falls back to empty.
  // `array-map-function-reference` now passes CSR conformance byte-for-byte
  // against the Hono reference; verified via `renderCsrComponent` directly.
  // #2073/#2321 class: `items` is seeded by a module-scope FUNCTION call
  // (`buildItems()`), not a static literal, so it can't be inlined into
  // the CSR template either; only the SSR-side compile refusal (BF101) and
  // its escape twins are pinned. `module-const-loop-source` and
  // `module-const-loop-source-child-component` (the fully-static-literal
  // shapes #2946 fixed) are NOT skipped here — those inline fine.
  'module-const-loop-source-computed',
  // #1247: prop-derived static loops materialize children at init time, not
  // template-eval — CSR shape covered by `static-loop-csr-materialize.test.ts`.
  'static-array-from-props',
  // #1268: same init-time materialization, childComponent variant.
  'static-array-from-props-with-component',
  // #1407: `applyRestAttrs` needs the JS spread bag in `_p`, but the harness's
  // single `props` object can't carry both the flat shape JS expects and the
  // typed shape Go's Input struct requires. Go-side expectedHtml pins the SSR
  // contract; CSR runtime parity is a tracked harness follow-up.
  'jsx-spread-props-object',
  // Keyed child-component loop materializes at init — same as `static-array-from-props`.
  'todo-app',
  // #1467: `placeholder` flows through `{...props}` → `applyRestAttrs` at
  // init, which the harness stubs as a noop — same class as
  // `jsx-spread-props-object`; the fixture-hydrate layer exercises it for real.
  'input',
  // #2131: same `applyRestAttrs`-not-modeled class as `input`; per-adapter
  // render conformance pins the SSR contract.
  'rest-spread-child-attrs',
  // Same `applyRestAttrs`-not-modeled harness class: the per-row `title`
  // reaches the child's root only through its `{...rest}` spread, which the
  // harness stubs, so the CSR template lacks it. Per-adapter render
  // conformance pins the SSR contract (and is where the go-template gap
  // this fixture exists for shows up).
  'composite-row-child-rest-bag-prop',
  // Same fixture with the child declared after the parent — same harness
  // limitation on the `{...rest}`-delivered `title`; the declaration-order
  // contract it exists for is pinned by per-adapter render conformance.
  'composite-row-child-rest-bag-prop-hoisted',
  // #2754: the stateless sibling of `rest-spread-child-attrs`, and the same
  // harness limitation — the CSR path here evaluates only the `template`
  // lambda, and `data-probe` arrives through `applyRestAttrs` in `init`,
  // which the harness stubs against a scopeless object. Per-adapter render
  // conformance pins the SSR contract (including the `bf` slot the fix
  // allocates); the client half is pinned by
  // `packages/jsx/src/__tests__/issue-2754-rest-spread-needs-slot.test.ts`.
  'stateless-rest-spread-forward',
  // The harness now mounts the fixture's `componentName` (the #1467
  // multi-export class — `__lastComponent` rendering the last demo export
  // instead of the pinned basic demo — is gone; radio-group, tabs, dialog,
  // popover, tooltip, kbd and reactive-props pass). What still diverges in
  // these demos is their icon markup: the CSR template emits the SVG
  // `viewBox` attribute as `view-box` (camelCase SVG attribute kebab-cased
  // on the client-built DOM) where SSR keeps `viewBox`. data-table also
  // hits the default-prop gap below.
  'accordion',
  'select',
  'dropdown-menu',
  'combobox',
  'command',
  // `pagination`: the pinned export IS last, but `{ className = '', ...props }`
  // destructure defaults aren't applied at template-eval, so CSR emits literal
  // `undefined` class tokens — the `renderToTest` default-prop limitation
  // (CLAUDE.md).
  'pagination',
  'data-table',
  // `bf-region` is emitted by the adapters' SSR `renderElement`; the CSR
  // template path deliberately omits it — client-built-DOM markers belong to
  // the deferred runtime region work (spec/router.md), not this lowering
  // spike. SSR emit is pinned by the `region-boundary` JSX conformance test.
  'region-boundary',
  // `conditional-return-fragment-branch` graduated out of this set (#3063):
  // the shape now refuses to compile (BF029) instead of silently diverging
  // between SSR and a pure client mount, so the fixture carries no
  // `expectedHtml` and the CSR conformance loop's own `!fixture.expectedHtml`
  // guard already skips it — no skip entry needed.
  // Priority-12 sweep: REAL SSR/CSR divergences (not harness artifacts),
  // skipped until the pipeline reconciles the two paths.
  // `jsx-element-prop` graduated (#2651 fixed): a non-children JSX prop now
  // reaches the CSR insert as `bfMarkup()`-branded HTML, matching the
  // claim-plan 'markup' classification instead of the stray `escapeText`
  // path that mangled the `__BF_PARENT_SCOPE__` sentinel.
  // `grandchild-composition` graduated (#2649 fixed): `renderChild` now
  // pushes `_parentScopeId` to a child's own derived scope while its
  // template evaluates, so a third composition level derives `test_s0_s0`
  // instead of collapsing onto `test_s0`. The `comment: true` wrapper
  // self-lookup collision that reverted the first attempt at this is
  // fixed at its source: a `comment: true` component's own root-level
  // child needs no `$c` lookup at all (it IS `__scope`) — see
  // `ClientJsContext.commentScopeRootSlotId` and
  // `comment-wrapper-grandchild-slot-collision.test.ts`.
  // `opaque-local-accessor-call` (`kind: 'refusal'`, BF101 on every DSL
  // adapter): a harness-configuration artifact, not a runtime gap. Whether
  // the CSR template may evaluate the opaque call inline (`label` →
  // `(makeLabel())()`) is decided by the adapter's `acceptsTemplateCall`
  // capability. The real pipeline always has one: `compileJSX` passes
  // Hono's (accepts any call, so production CSR renders `ready`, matching
  // `expectedHtml`), and every DSL adapter refuses the shape at compile
  // time. This harness compiles with NO adapter capabilities, so the call
  // is not inlined and the slot is emitted empty. Its `/* @client */` twin
  // (`opaque-local-accessor-call-client`) is NOT skipped.
  'opaque-local-accessor-call',
  // #3059: `renderCsrComponent`'s harness stubs `createPortal` as a no-op
  // (`csr-render.ts`: `const createPortal = () => {}`) — it never moves
  // anything or stamps `bf-po`, unlike the REAL runtime
  // (`packages/client/src/runtime/portal.ts`) the oracle's `csr-mount`
  // leg uses. Before #3059 this coincidentally matched `expectedHtml`
  // (Hono rendered the same portal-marked element inline too, with no
  // `bf-po`); now that Hono places it at the `<BfPortals />` outlet, this
  // Bun-side mock's stub diverges from it — a pre-existing harness gap
  // the fix newly exposes, not a real CSR regression. `select` /
  // `dropdown-menu` / `combobox` carry the identical gap but were already
  // skipped above for unrelated reasons.
  'dialog',
  'popover',
  'portal',
  // A `/* @client */` prop on a component inside a loop row: the CSR
  // template omits it by design (it is deferred to `initChild`'s props
  // getters, `IRProp.clientOnly`), and this harness evaluates only the
  // `template` lambda — same not-modeled-init class as `input`. Per-adapter
  // render conformance pins the SSR contract these fixtures exist for.
  'loop-row-child-children-nested-client-prop',
  'loop-row-child-children-nested-client-row-prop',
  'loop-element-row-child-client-row-prop',
])
