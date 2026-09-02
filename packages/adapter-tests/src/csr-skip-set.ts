/**
 * Fixtures excluded from `csr-conformance.test.ts` (#2613). Extracted to
 * its own module so `packages/compat`'s escape-coverage tier-2 check reads
 * the same set without the two silently drifting apart.
 */
export const CSR_SKIP_FIXTURES: ReadonlySet<string> = new Set([
  // #2741: the effect-update emit prop-rewrites the queryHref params
  // object's KEYS (`{ _p.tag: _p.tag }`) — the client module is a syntax
  // error. The hydrate template lambda in the same output is correct;
  // SSR conformance pins the contract. Graduation: fix the rewrite,
  // delete this entry.
  'query-href',
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
  // #2754: the stateless sibling of `rest-spread-child-attrs`, and the same
  // harness limitation — the CSR path here evaluates only the `template`
  // lambda, and `data-probe` arrives through `applyRestAttrs` in `init`,
  // which the harness stubs against a scopeless object. Per-adapter render
  // conformance pins the SSR contract (including the `bf` slot the fix
  // allocates); the client half is pinned by
  // `packages/jsx/src/__tests__/issue-2754-rest-spread-needs-slot.test.ts`.
  'stateless-rest-spread-forward',
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
  // #2806: same `applyRestAttrs`-not-modeled class as `jsx-spread-props-object`
  // / `rest-spread-child-attrs` / `stateless-rest-spread-forward` above, but
  // reading the rest bag directly in JSX (`{rest.header}`) rather than
  // spreading it onto an element's attrs — the emitted CSR template
  // references `rest` without ever binding it, a guaranteed
  // `ReferenceError` (also pinned in `client-js-scope.test.ts`'s
  // `KNOWN_UNDECLARED`). SSR is correct on every adapter; go-template's own
  // orthogonal refusal for this shape is #2805.
  'jsx-element-prop-rest-bag-dynamic',
])
