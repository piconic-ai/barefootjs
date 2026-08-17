/**
 * Fixtures excluded from `csr-conformance.test.ts` (#2613). Extracted to
 * its own module so `packages/compat`'s escape-coverage tier-2 check reads
 * the same set without the two silently drifting apart.
 */
export const CSR_SKIP_FIXTURES: ReadonlySet<string> = new Set([
  // Stateless components: no client JS emitted (fully server-rendered)
  'props-static',
  'nested-elements',
  'void-elements',
  'class-vs-classname',
  'style-attribute',
  'fragment',
  // Local array variable (items) is not available at CSR template module scope.
  // CSR templates only have access to props and signals, not file-scope constants.
  'static-array-children',
  // #2073: `.map(format)` closes over a module-scope const — same
  // CSR-template-scope class as `static-array-children`; Hono render
  // conformance covers the real-JS runtime.
  'array-map-function-reference',
  // #1247: prop-derived static loops materialize children at init time, not
  // template-eval — CSR shape covered by `static-loop-csr-materialize.test.ts`.
  'static-array-from-props',
  // Same init-time materialization as `static-array-from-props`.
  'sibling-loops-key-isolation',
  // #1268: same init-time materialization, childComponent variant.
  'static-array-from-props-with-component',
  // Attribute-order divergence only: SSR emits style first, CSR injection bf-s first.
  'style-object-static',
  // Synthetic scope wrapper has style="display:contents" before bf-s (#968).
  // Same attribute-ordering divergence as style-object-static/-dynamic.
  'top-level-ternary',
  // Same synthetic-wrapper attribute-order divergence as `top-level-ternary` (#971).
  'return-logical-and',
  'return-logical-or',
  'return-nullish-coalescing',
  'return-map',
  // #1244: attribute-order-only divergence. A lone `<li key={id} {...rest}>`
  // keeps the legacy inline emit (the collision-safe merge needs a non-`key`
  // explicit attr) to preserve the unconditional `data-key` debug contract, so
  // SSR and CSR order `data-key` vs the spread differently — identical DOM
  // after parsing. The semantics-violating collision shape is locked by
  // `compiler-stress-1244.test.ts`.
  'rest-destructure-object-spread-in-map',
  // #1407: `applyRestAttrs` needs the JS spread bag in `_p`, but the harness's
  // single `props` object can't carry both the flat shape JS expects and the
  // typed shape Go's Input struct requires. Go-side expectedHtml pins the SSR
  // contract; CSR runtime parity is a tracked harness follow-up.
  'jsx-spread-rest-prop',
  'jsx-spread-props-object',
  // Template lambda closes over an init-wired local (`toggleItems`, `value`)
  // — same class as `static-array-children`.
  'toggle-shared',
  'reactive-props',
  'props-reactivity-comparison',
  // Memo reads the env-signal getter `sp()`, wired only at init — same class
  // as `toggle-shared`; runtime `env-signal` tests + per-adapter render
  // conformance (#2075) cover it.
  'search-params-derived-memo',
  // Bare-getter sibling: the stubbed getter yields literal `null` text where
  // expectedHtml pins the empty per-adapter contract (#2075).
  'search-params-derived-memo-bare',
  // Keyed child-component loop materializes at init — same as `static-array-from-props`.
  'todo-app',
  // #1448 Tier B — iteration shape fixtures are SSR-only prop-based
  // components. The CSR template path can't resolve bare prop refs
  // (items, etc.) without `"use client"` + signal wiring.
  'array-entries',
  'array-keys',
  'array-values',
  // #1467: multi-export source — the harness's `__lastComponent` renders
  // `KbdGroup`, not the pinned `Kbd`; SSR `componentName` pin keeps Hono
  // honest, and `kbd` ships no interactions anyway.
  'kbd',
  // #1467: `placeholder` flows through `{...props}` → `applyRestAttrs` at
  // init, which the harness stubs as a noop — same class as
  // `jsx-spread-rest-prop`; the fixture-hydrate layer exercises it for real.
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
  // `object-entries-map` / `nested-loop-outer-binding`: nested/tuple loops
  // disagree on `data-key` depth suffixes between SSR and template-eval.
  'object-entries-map',
  'nested-loop-outer-binding',
  // Same data-key depth-suffix disagreement, one level deeper.
  'nested-loop-triple-depth',
  // `jsx-element-prop`: a non-children JSX prop reaches the CSR insert as an
  // escaped string (`__BF_PARENT_SCOPE__` still embedded), not markup.
  'jsx-element-prop',
  // `nested-fragments`: a multi-root fragment attaches `bf-s` to its
  // first element in CSR, while SSR carries the scope on a
  // `<!--bf-scope:...-->` comment the normalizer strips.
  'nested-fragments',
  // `grandchild-composition`: third level reuses the parent scope id
  // (`test_s0`) in CSR instead of deriving `test_s0_s0` as SSR does. #2444
  // fixed the sibling case, but deriving here via `renderChild`'s
  // `_parentScopeId` push collided with `comment: true` wrapper self-lookup
  // (`$cSingle`'s short-suffix fallback in `query.ts`), breaking hydration
  // when an inner component's first slot id coincides with the wrapper's slot
  // number (site/ui xyflow Highlight-Depth regression) — known limitation #2649.
  'grandchild-composition',
  // Lowers to the root-ternary plan cleanly; skipped only for the same #968
  // wrapper attribute-ordering divergence as `top-level-ternary`.
  'signal-early-return',
])
