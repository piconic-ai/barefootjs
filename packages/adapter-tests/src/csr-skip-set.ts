/**
 * Fixtures excluded from `csr-conformance.test.ts` (#2613). Extracted to
 * its own module so `packages/compat`'s escape-coverage tier-2 check reads
 * the same set without the two silently drifting apart.
 */
export const CSR_SKIP_FIXTURES: ReadonlySet<string> = new Set([
  // #2073: `.map(format)` closes over a module-scope const, which is not
  // available at CSR template module scope (CSR templates only have access
  // to props and signals); Hono render conformance covers the real-JS runtime.
  'array-map-function-reference',
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
  // #1467 multi-export class (NOT #1407): the shared source compiles several
  // components and the harness's `__lastComponent` renders
  // `PropsReactivityComparison`, not the pinned `ReactiveProps` — verified by
  // the rendered output's `props-reactivity-comparison` container class.
  'reactive-props',
  // Memo reads the env-signal getter `sp()`, wired only at init; runtime
  // `env-signal` tests + per-adapter render conformance cover it —
  // known limitation #2654.
  'search-params-derived-memo',
  // Bare-getter sibling: same init-only `searchParams` binding, referenced
  // by the template lambda at module scope (ReferenceError) — #2654.
  'search-params-derived-memo-bare',
  // https://github.com/piconic-ai/barefootjs/issues/2654: the template
  // lambda reads the `createSearchParams()`-destructured getter directly,
  // but that getter is only bound inside `init...` — the template itself
  // carries no import or re-binding of its own, so evaluating it standalone
  // (as this harness does) throws a ReferenceError. Previously masked by
  // the harness's bare module-scope `searchParams` stub, which happened to
  // match this fixture's getter name.
  'search-params',
  // Same #2654 ReferenceError as `search-params`, one layer down: the
  // `visible` memo's template read closes over `searchParams()`, itself
  // only bound at init time. https://github.com/piconic-ai/barefootjs/issues/2654
  'search-params-derived-filter',
  // Keyed child-component loop materializes at init — same as `static-array-from-props`.
  'todo-app',
  // #1467: multi-export source — the harness's `__lastComponent` renders
  // `KbdGroup`, not the pinned `Kbd`; SSR `componentName` pin keeps Hono
  // honest, and `kbd` ships no interactions anyway.
  'kbd',
  // #1467: `placeholder` flows through `{...props}` → `applyRestAttrs` at
  // init, which the harness stubs as a noop — same class as
  // `jsx-spread-props-object`; the fixture-hydrate layer exercises it for real.
  'input',
  // #2131: same `applyRestAttrs`-not-modeled class as `input`; per-adapter
  // render conformance pins the SSR contract.
  'rest-spread-child-attrs',
  // #1467: same multi-export limitation as `kbd` — `__lastComponent` renders
  // the last demo export instead of the pinned basic demo (radio-group,
  // accordion, tabs, dialog, popover, tooltip, select, dropdown-menu,
  // combobox, command; data-table also hits the default-prop gap below).
  'radio-group',
  'accordion',
  'tabs',
  'dialog',
  'popover',
  'tooltip',
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
  // Priority-12 sweep: REAL SSR/CSR divergences (not harness artifacts),
  // skipped until the pipeline reconciles the two paths.
  // `jsx-element-prop`: a non-children JSX prop reaches the CSR insert as an
  // escaped string (`__BF_PARENT_SCOPE__` still embedded), not markup —
  // known limitation #2651.
  'jsx-element-prop',
  // `grandchild-composition`: third level reuses the parent scope id
  // (`test_s0`) in CSR instead of deriving `test_s0_s0` as SSR does. #2444
  // fixed the sibling case, but deriving here via `renderChild`'s
  // `_parentScopeId` push collided with `comment: true` wrapper self-lookup
  // (`$cSingle`'s short-suffix fallback in `query.ts`), breaking hydration
  // when an inner component's first slot id coincides with the wrapper's slot
  // number (site/ui xyflow Highlight-Depth regression) — known limitation #2649.
  'grandchild-composition',
])
