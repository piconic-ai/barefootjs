/**
 * Fixtures excluded from `csr-conformance.test.ts` (#2613). Extracted to
 * its own module so `packages/compat`'s escape-coverage tier-2 check reads
 * the same set without the two silently drifting apart.
 */
export const CSR_SKIP_FIXTURES: ReadonlySet<string> = new Set([
  // The client-directive escape intentionally elides the outer loop's
  // SSR rows. Its native-element CSR template eagerly creates those rows,
  // so comparing it with the empty SSR placeholder is not its contract.
  // The prop-precompute twin supplies the SSR/CSR parity proof; this twin's
  // mounted interactions were also verified in the real browser.
  'conditional-nested-loop-client-reactivity',
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
  // #3473: the same function-scope computed const as `static-array-from-props`,
  // parenthesized; the template array is `[]` there too.
  'computed-const-loop-source-parenthesized',
  // #3494: the same computed const (`Object.keys(labels)`) read outside a
  // loop; SSR refuses it on the template adapters and the CSR template has
  // no value for it either.
  'computed-const-read-unlowerable',
  // #3954: a memo calling a literal const's method that spreads a prop
  // (`api.add()`). SSR refuses it on the template adapters (BF101, pinned under
  // `array-literal-element-spread`), and the CSR template does not carry a
  // const holding a function either, so the memo renders empty there too.
  'destructure-default-spread-method-memo',
  // The same method called in markup (`{api.add()}`).
  'destructure-default-spread-method-text',
  // #3912: a row condition calling a component-scope helper
  // (`isSel(item.id)`). The helper is an init local, which the CSR template
  // has no init to declare, so the template reads the call as `undefined`
  // and renders the false branch; the template adapters refuse the call.
  // The loop's own first run corrects the rows on a real mount, which the
  // real-browser fixture-hydrate and oracle suites check.
  'static-loop-conditional-function-helper',
  // #3913: the row preamble reads an outer signal (`row.name + suffix()`).
  // The CSR template is evaluated without the component's init, so `suffix`
  // is not defined there. The real-browser fixture-hydrate and oracle suites
  // check the client, and per-adapter render conformance pins the SSR HTML.
  'keyed-row-branch-preamble-signal',
  // A value an init-time mutation computes (`const n = a.push('x') &&
  // b.length` over `let { a = [], b = a } = props`): the CSR template has no
  // init to run, and the template adapters refuse the call. The real-browser
  // fixture-hydrate and oracle suites check the client.
  'destructure-default-shared-array',
  'destructure-default-shared-array-renamed',
  // A binding a body statement mutates (`items.push('z')`) handed to a child
  // as a prop: the client passes the child the live binding from init
  // (`upsertChild`), so the CSR template holds only the child's placeholder.
  // The mount renders the child with the mutated array; per-adapter render
  // conformance carries the server divergence this fixture is pinned for.
  'body-statement-write-child-prop',
  // Children deferred to init (their prop reads an init-only local) under a
  // `<p>`, a `<tbody>`, a `<tr>` and an `<svg>`: the CSR template holds the
  // children's placeholders, which this string-level harness does not mount.
  // What these fixtures pin is where the parser leaves each placeholder and
  // so where the mounted child lands (#3955); the real-browser
  // fixture-hydrate suite and the `three-point` oracle's `csr-mount` render
  // check that.
  'deferred-child-phrasing-parent',
  'deferred-child-table-svg-parent',
  // A memo declared before a body statement mutates the binding it reads
  // (`createMemo(() => local.length)`, then `local.push('z')`): the CSR
  // template cannot inline a memo over a binding a statement changes, so its
  // slot is empty until the mount's effect fills it with the memo's value
  // (`1`, checked by `issue-3719-body-statement-write.test.ts` in
  // `packages/client`). Per-adapter render conformance pins the server HTML.
  'body-statement-write-earlier-memo',
  // A const initialized by a local function call (`const initial = value()`)
  // and an arrow const wrapping one live in the init body: the CSR template
  // has no init to run, so the signals seeded through them render empty
  // there. The server render is what these fixtures pin.
  'signal-seed-const-from-uninlinable-local-function',
  'local-function-call-through-const-and-wrapper',
  // A module function calling another module function that reads a module
  // const the component hides (`outer()` → `inner()` → `label`): the client
  // script keeps `outer` in the init body, which the CSR template has no
  // init to declare, so the template renders the two `outer()` reads empty
  // (the same not-modeled-init class as the entries above). The mount fills
  // them, and the server render is what this fixture pins.
  'module-function-reads-module-binding',
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
  // Same `applyRestAttrs`-not-modeled harness class: the `rest-carrier`
  // rows' `token` reaches `Tag`'s root only through its `{...rest}` spread,
  // which the harness stubs. The fixture exists for the go-template row
  // construction and key carrier, pinned by per-adapter render conformance.
  'loop-row-child-prop-destinations',
  // #2754: the stateless sibling of `rest-spread-child-attrs`, and the same
  // harness limitation — the CSR path here evaluates only the `template`
  // lambda, and `data-probe` arrives through `applyRestAttrs` in `init`,
  // which the harness stubs against a scopeless object. Per-adapter render
  // conformance pins the SSR contract (including the `bf` slot the fix
  // allocates); the client half is pinned by
  // `packages/jsx/src/__tests__/issue-2754-rest-spread-needs-slot.test.ts`.
  'stateless-rest-spread-forward',
  // #3688: the parent's `{...props}` reaches the child's `renderChild(...)`
  // props, but `title` lands on the child's root only through its own
  // `{...rest}` element spread — `applyRestAttrs` in `init`, which the
  // harness stubs. A real mount is pinned by
  // `packages/client/__tests__/runtime/issue-3688-props-spread-merge.test.ts`.
  'component-spread-props-rest-bag',
  // Same `applyRestAttrs`-not-modeled harness class: `data-x` / `data-n` /
  // `title` reach `Box`'s root only through its `{...rest}` spread.
  'child-string-prop-literal-lookalike-rest-bag',
  // Same `applyRestAttrs`-not-modeled harness class: `Kid` spreads its whole
  // props object onto its root.
  'child-undeclared-prop-whole-props-spread',
  // Same `applyRestAttrs`-not-modeled harness class: `Kid` and `Pill` spread
  // their whole props object (named `scopeID` / `bfParent`) onto their root.
  'props-object-non-props-name-spread',
  // Same `applyRestAttrs`-not-modeled harness class: each child spreads
  // its rest bag onto its root.
  'child-rest-bag-generated-field-name',
  // Same `applyRestAttrs`-not-modeled harness class: `Badge` spreads its
  // body rest onto its root. The real-browser fixture-hydrate and oracle
  // suites check the client.
  'open-body-rest-spread-element',
  // Same `applyRestAttrs`-not-modeled harness class: the `<script>`'s
  // `type` and `id` arrive through its `{...rest}` spread. Per-adapter
  // render conformance pins the SSR contract the fixture exists for.
  'raw-text-brace-delimiter-script-spread',
  // Same `applyRestAttrs`-not-modeled harness class: every bag reaches its
  // element only through a spread, which the harness stubs as a noop, so the
  // template shows the literal each spread overrides. The per-adapter render
  // conformance pins the SSR contract.
  'literal-attr-before-spread',
  'literal-boolean-attr-before-spread',
  // Same class: the spread bags reach their elements only through
  // `applyRestAttrs`; `attr-spread-key-overlap` pins the SSR contract.
  'attr-spread-key-overlap',
  // Same class: the open bags reach their elements only through
  // `applyRestAttrs`; these fixtures pin the SSR spread-key names.
  'spread-open-bag-attr-names',
  'spread-open-bag-hono-renamed-keys',
  'spread-open-bag-literal-alias-before',
  'spread-open-bag-literal-renamed-elsewhere',
  'spread-open-bag-literal-case-alias',
  // A DOM serializes an HTML element's attribute names lowercased, so the
  // client-built element shows the closed rest's `tabIndex` as `tabindex`
  // where the reference writes the key's spelling; a browser reads both as
  // one attribute. The per-adapter render conformance pins the SSR contract.
  'spread-closed-rest-literal-case-alias',
  // The CSR template renders a closed rest's `HIDDEN: "yes"` as a bare
  // boolean (limitation `rest-key-boolean-name-case`), and both keys of a
  // rest declaring `tabIndex` and `tabindex` beside a later `tabindex`
  // (limitation `closed-rest-both-cases-later-write`).
  'spread-closed-rest-boolean-case-keys',
  'spread-closed-rest-both-cases-later-write',
  // The CSR template renders every expansion of a repeated closed rest, as
  // the template adapters do (limitation `closed-rest-repeated`).
  'spread-closed-rest-repeated',
  'spread-closed-rest-repeated-last',
  'spread-closed-rest-repeated-around-bag',
  'spread-closed-rest-repeated-after-bag',
  'spread-closed-rest-repeated-attr-spelled-bag-key',
  'spread-closed-rest-then-bag-renamed-key',
  // Open bags reach their elements only through `applyRestAttrs`; these
  // fixtures pin the SSR contract.
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
  // Same harness-configuration artifact (#3952): whether the CSR template
  // may evaluate the zero-argument helper call `mk()` through the inlined
  // module const `B` is decided by the adapter's `acceptsTemplateCall`,
  // which this harness does not pass, so the text slot is emitted empty.
  // Production CSR compiles with Hono's (accepts any call), inlines
  // `(mk()).k` and declares `mk` at module level, rendering `v` (the
  // client-JS scope gate compiles with Hono and checks the declaration);
  // every DSL adapter refuses the shape (BF101). Its sibling with an
  // argument (`module-const-helper-call-spread-inlined`) is NOT skipped.
  'module-const-helper-call-inlined',
  // Same harness-configuration artifact: whether the CSR template may
  // evaluate `Date.UTC()` through the computed const `stamp` is decided by
  // the adapter's `acceptsTemplateCall`, which this harness does not pass,
  // so the text slot is emitted empty. Production CSR compiles with Hono's
  // (accepts any call) and renders `NaN`, matching `expectedHtml`; every
  // template adapter refuses the shape (BF101, #3505).
  'unlowered-global-call',
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
  // Same harness gap for the fragment-root variant, and more so: its
  // `bf-po` is stamped by the init body right after the ref callback runs,
  // which this template-only harness never evaluates. The real-browser
  // oracle's `csr-mount` leg covers it.
  'portal-fragment-root',
  // Same harness gap for a top-level portaled element next to forwarded
  // children (#3432); its SSR escaping is what the fixture pins.
  'captured-markup-escaping',
  // Same harness gap for a loop-row element a `ref` callback portals
  // (#3318): SSR places it at the outlet, and the template-only CSR render
  // leaves it in its row. The real-browser oracle's `csr-mount` leg covers
  // all seven.
  'row-portal-ref',
  'row-portal-ref-remove',
  'row-portal-ref-static',
  'row-portal-ref-branch',
  'row-portal-ref-composite',
  'row-portal-ref-scope',
  'row-portal-ref-contents',
  // A `/* @client */` prop on a component inside a loop row: the CSR
  // template omits it by design (it is deferred to `initChild`'s props
  // getters, `IRProp.clientOnly`), and this harness evaluates only the
  // `template` lambda — same not-modeled-init class as `input`. Per-adapter
  // render conformance pins the SSR contract these fixtures exist for.
  'loop-row-child-children-nested-client-prop',
  'loop-row-child-children-nested-client-row-prop',
  'loop-element-row-child-client-row-prop',
  // Markup, or a memo it reads, calling a local function or an object
  // const's method that reads a component local (a memo, a literal const):
  // the `template` lambda this harness evaluates is module scope, so it
  // cannot call the init body's function, and the text slot is filled once
  // init runs. Per-adapter render conformance pins the SSR contract (every
  // template adapter refuses the inherited-key read, BF101).
  'module-const-inherited-key-function',
  'module-const-inherited-key-function-direct',
  'module-const-inherited-key-function-nested',
  'module-const-inherited-key-object-method',
  'module-const-inherited-key-memo-method',
])

/**
 * Fixtures whose CSR render diverges from the reference, each citing the
 * `silent` registry limitation it is an instance of
 * (`packages/adapter-tests/limitations/<id>.ts`). Unlike a skip,
 * `csr-conformance.test.ts` still renders these and asserts the output
 * STILL differs, so a fix that lands without deleting the row goes red
 * ("stale — delete the entry"). The compat join test checks the id exists
 * and that the entry lists the fixture.
 */
export const CSR_RENDER_DIVERGENCES: Readonly<Record<string, { limitation: string }>> = {
  // An object const holding an arrow, read for a listed key in markup: the
  // CSR template does not carry the const, so `{H.safe}` renders empty.
  'module-const-inherited-key-object-safe': { limitation: 'csr-template-object-const-function-property' },
  // The same const read through a memo: the CSR template cannot inline the
  // memo over a const holding an arrow, so `m()` renders empty.
  'memo-object-const-arrow-sibling-key': { limitation: 'csr-template-object-const-function-property' },
  'memo-module-object-const-arrow-sibling-key': { limitation: 'csr-template-object-const-function-property' },
  // The same for a component const read for a listed key beside an uncalled method.
  'destructure-default-spread-stored-method': { limitation: 'csr-template-object-const-function-property' },
  // A boolean text child: the CSR template prints `true` / `false`; JSX
  // renders nothing.
  // A JSX prop holding a nested component, read in a conditional arm or
  // forwarded to a grandchild: the CSR template stringifies the branded prop
  // in the arm (`[object Object]`) and resolves the forwarded element's scope
  // to the receiving component.
  'jsx-prop-nested-component-conditional': { limitation: 'nested-component-in-jsx-prop-conditional-arm' },
  'jsx-prop-nested-component-forwarded': { limitation: 'nested-component-in-jsx-prop-forwarded' },
  // A `null` / `undefined` `style` object property: the CSR template omits
  // the `style` attribute where the reference keeps `style=""`.
  'style-object-nil-property': { limitation: 'style-object-nil-property' },
  // A default assigning an earlier binding (`b = (a = 2)`): the CSR template
  // reads `c` as `_p.c ?? _p.a`, so the assignment never runs.
  'destructure-default-earlier-assignment': { limitation: 'destructure-default-assigns-earlier-binding' },
  // An uncalled read of a local function: the CSR template prints the
  // function's source text where JSX renders nothing.
  'markup-local-function-read-named-like-prop': { limitation: 'local-function-read-named-like-prop' },
  // A parameter default reading a module const (`{ b = DEF.toUpperCase() }`)
  // beside a body const of the same name: the CSR template inlines the body
  // const into the default.
  'destructure-default-param-body-const-same-name': { limitation: 'client-binding-named-like-module-binding' },
  // An element child a component reads into a signal: the CSR template
  // prints the signal's initial value as escaped text.
  'children-element-read-into-state': { limitation: 'children-element-read-into-state' },
}
