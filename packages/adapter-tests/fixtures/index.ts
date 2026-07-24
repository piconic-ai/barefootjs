import { fixture as counter } from './counter'
// Same-file reactive-factory helpers (#931, #2325): a helper wrapping
// createSignal in a shorthand-object return inlines pre-analysis, so the
// compiled output — and thus every adapter's marked template — must be
// byte-identical to counter.ts's hand-written createSignal call. This is
// the cross-adapter proof that #2325's object-return inlining generalizes
// (the compiler unit tests already cover it against a single test
// adapter; this fixture is what actually exercises Hono / Go / PHP /
// Django / Rust / Ruby / Perl / ... through the shared harness).
import { fixture as reactiveFactoryObjectReturn } from './reactive-factory-object-return'
// Shared-component corpus (#1466): fixture-hydrate fixtures lifted
// from `integrations/shared/components/` also participate in
// cross-adapter HTML conformance so the same .tsx is guaranteed to
// lower to byte-equivalent normalised HTML across Hono / Echo / Mojo
// / Go. `defineSharedFixture` merges a deterministic `__instanceId`
// into `props` so live SSR renders and the frozen
// `__snapshots__/<id>.html` carry the same `<ComponentName>_test`
// root scope id, normalised to `<ComponentName>_*` by `normalizeHTML`.
import { fixture as counterShared } from './counter-shared'
import { fixture as toggleShared } from './toggle-shared'
import { fixture as conditionalReturnButton } from './conditional-return-button'
import { fixture as conditionalReturnLink } from './conditional-return-link'
import { fixture as reactiveProps } from './reactive-props'
import { fixture as propsReactivityComparison } from './props-reactivity-comparison'
import { fixture as form } from './form'
import { fixture as portal } from './portal'
import { fixture as todoApp } from './todo-app'
import { fixture as todoAppSsr } from './todo-app-ssr'
import { fixture as aiChat } from './ai-chat'
// #1467 Phase 2a: first `site/ui` source-root fixture (Button + its
// auto-inferred Slot sibling), proving the UI loader infrastructure.
import { fixture as button } from './button'
// #1467 Phase 2b: basic interactive `site/ui` primitives. Uncontrolled
// state toggles (`toggle` / `switch` / `checkbox`), pass-through native
// form controls (`input` / `textarea`), and static helpers exercising the
// runner's `interactions: undefined` skip path (`label` / `kbd`).
import { fixture as toggle } from './toggle'
import { fixture as switchFixture } from './switch'
import { fixture as checkbox } from './checkbox'
import { fixture as input } from './input'
import { fixture as textarea } from './textarea'
import { fixture as label } from './label'
import { fixture as kbd } from './kbd'
// #1467 Phase 2b deferral: `radio-group` — first fixture on the `demo`
// source root (`site/ui/components/<name>.tsx`), composing RadioGroup +
// RadioGroupItem with context propagation, which the single-root `ui`
// fixture model can't express.
import { fixture as radioGroup } from './radio-group'
// #1467 Phase 2c (disclosure): composed demo-root fixtures. `accordion`
// pairs context/effect-driven children with reactive-prop attribute
// bindings (and nests siblings: accordion → icon); `tabs` is the
// pure-prop contrast — no context, parent memos drive every binding.
import { fixture as accordion } from './accordion'
import { fixture as tabs } from './tabs'
// #1467 Phase 2c (overlay): portal-mounted surfaces. `dialog` (modal:
// ESC + close-button paths, context across the portal boundary),
// `popover` (trigger-anchored positioning via getBoundingClientRect),
// `tooltip` (hover-driven signal -> template attribute bindings; first
// user of the `hover` interaction step).
import { fixture as dialog } from './dialog'
import { fixture as popover } from './popover'
import { fixture as tooltip } from './tooltip'
// #1467 Phase 2d (selection/menu composites): `select` (portal listbox
// selection round trip), `dropdown-menu` (checkbox items toggling
// without closing), `combobox` (typed filtering via the hidden
// attribute + empty-state effect), `command` (always-open palette,
// search fan-out to item/group/empty visibility effects).
import { fixture as select } from './select'
import { fixture as dropdownMenu } from './dropdown-menu'
import { fixture as combobox } from './combobox'
import { fixture as command } from './command'
// #1467 Phase 2e (complex): `pagination` (one signal fanned across
// seven href="#" links whose handlers must preventDefault) and
// `data-table` (keyed-loop reorder on sort — the corpus's first keyed
// reconciliation probe). `calendar` and `carousel` stay out of this
// frozen-HTML cross-adapter corpus (`jsxFixtures`), for different
// reasons: the calendar grid renders the current month (SSR output is a
// function of the wall clock — non-deterministic snapshot), so its
// cross-adapter SSR is pinned by the deterministic compile conformance in
// `src/__tests__/calendar-cross-adapter.test.ts` (Go/Mojo/Xslate/Hono,
// zero diagnostics — the #1467 predicate -> precomputed-field fix)
// instead. `carousel` *does* join the real-browser **fixture-hydrate**
// corpus as of #1971 — discovered there by directory convention
// (`loadAllSharedFixtures`), not by this list — once the host page grew a
// gated embla importmap + vendor-serving route (`externalImports`) and
// the `drag` interaction step. Its SSR is static, but it carries a
// browser-only embla dependency, so it stays a hydration fixture rather
// than a frozen cross-adapter HTML snapshot. E2E runtime behavior for
// both still lives in `site/ui/e2e/{calendar,carousel}.spec.ts`.
import { fixture as pagination } from './pagination'
import { fixture as dataTable } from './data-table'
// #1694: text-content HTML-escaping (parallel to the #1692 attribute fix).
import { fixture as textEscape } from './text-escape'
// Priority 1: Core reactivity
import { fixture as signalWithFallback } from './signal-with-fallback'
import { fixture as signalDefaultFromJsx } from './signal-default-from-jsx'
import { fixture as controlledSignal } from './controlled-signal'
import { fixture as signalPropSameName } from './signal-prop-same-name'
import { fixture as memo } from './memo'
import { fixture as effect } from './effect'
import { fixture as multipleSignals } from './multiple-signals'
// Priority 2: Props and composition
import { fixture as propsStatic } from './props-static'
import { fixture as propsReactive } from './props-reactive'
import { fixture as nestedElements } from './nested-elements'
// Priority 3: Conditionals
import { fixture as ternary } from './ternary'
import { fixture as nestedTernary } from './nested-ternary'
import { fixture as conditionPositionTernary } from './condition-position-ternary'
import { fixture as topLevelTernary } from './top-level-ternary'
import { fixture as logicalAnd } from './logical-and'
import { fixture as conditionalClass } from './conditional-class'
import { fixture as ifStatement } from './if-statement'
// Priority 4: Loops
import { fixture as mapBasic } from './map-basic'
import { fixture as mapWithIndex } from './map-with-index'
import { fixture as filterSimple } from './filter-simple'
import { fixture as filterNestedCallbackPredicate } from './filter-nested-callback-predicate'
import { fixture as filterNestedCallbackPredicateClient } from './filter-nested-callback-predicate-client'
import { fixture as filterTypeofPredicate } from './filter-typeof-predicate'
import { fixture as filterTypeofPredicateClient } from './filter-typeof-predicate-client'
import { fixture as filterNestedFindPredicate } from './filter-nested-find-predicate'
import { fixture as fillUnsupported } from './fill-unsupported'
import { fixture as findTypeofPredicate } from './find-typeof-predicate'
import { fixture as someTypeofPredicate } from './some-typeof-predicate'
import { fixture as everyTypeofPredicate } from './every-typeof-predicate'
import { fixture as reduceTypeofBody } from './reduce-typeof-body'
import { fixture as reduceRightTypeofBody } from './reduce-right-typeof-body'
import { fixture as flatMapTypeofProjection } from './flatmap-typeof-projection'
import { fixture as mapIfChainBody } from './map-if-chain-body'
import { fixture as sortSimple } from './sort-simple'
import { fixture as filterSortChain } from './filter-sort-chain'
import { fixture as mapNested } from './map-nested'
import { fixture as mapDynamicClass } from './map-dynamic-class'
import { fixture as siblingMaps } from './sibling-maps'
import { fixture as fragmentLoopChildren } from './fragment-loop-children'
// Priority 5: Elements and attributes
import { fixture as voidElements } from './void-elements'
import { fixture as dynamicAttributes } from './dynamic-attributes'
import { fixture as classVsClassname } from './class-vs-classname'
import { fixture as styleAttribute } from './style-attribute'
import { fixture as styleObjectStatic } from './style-object-static'
import { fixture as styleObjectDynamic } from './style-object-dynamic'
// Priority 6: Advanced patterns
import { fixture as fragment } from './fragment'
import { fixture as fragmentConditional } from './fragment-conditional'
import { fixture as loopItemConditional } from './loop-item-conditional'
import { fixture as clientOnly } from './client-only'
import { fixture as clientOnlyLoop } from './client-only-loop'
import { fixture as clientOnlyLoopWithSiblingCond } from './client-only-loop-with-sibling-cond'
import { fixture as eventHandlers } from './event-handlers'
import { fixture as defaultProps } from './default-props'
import { fixture as untypedPropsReads } from './untyped-props-reads'
import { fixture as bareTextOptionalScalar } from './bare-text-optional-scalar'
import { fixture as nullishCoalescingText } from './nullish-coalescing-text'
import { fixture as nullishCoalescingDestructured } from './nullish-coalescing-destructured'
import { fixture as nullishCoalescingJsx } from './nullish-coalescing-jsx'
import { fixture as logicalOrJsx } from './logical-or-jsx'
import { fixture as branchSelfClosing } from './branch-self-closing'
import { fixture as branchMap } from './branch-map'
import { fixture as branchLocalFilterJoin } from './branch-local-filter-join'
import { fixture as returnLogicalAnd } from './return-logical-and'
import { fixture as returnLogicalOr } from './return-logical-or'
import { fixture as returnNullishCoalescing } from './return-nullish-coalescing'
import { fixture as returnMap } from './return-map'
// Priority 7: Multi-file composition
import { fixture as childComponent } from './child-component'
import { fixture as multiComponentModule } from './multi-component-module'
import { fixture as restSpreadChildAttrs } from './rest-spread-child-attrs'
import { fixture as componentWithJsxChildren } from './component-with-jsx-children'
// #2158: Counter + a children-forwarding Button child — the render-stage
// contract's anchor fixture (see `../src/render.contract.ts`), rendered
// through every adapter's real backend and also joining this HTML
// conformance corpus like any other multi-file fixture.
import { fixture as counterButtons } from './counter-buttons'
import { fixture as nativeSelectSpreadChildren } from './native-select-spread-children'
import { fixture as multipleInstances } from './multiple-instances'
import { fixture as staticArrayChildren } from './static-array-children'
import { fixture as staticArrayOfObjectsElementBody } from './static-array-of-objects-element-body'
import { fixture as staticArrayFromProps } from './static-array-from-props'
import { fixture as staticArrayFromPropsWithComponent } from './static-array-from-props-with-component'
// Priority 8: CSR conformance
import { fixture as booleanDynamicAttr } from './boolean-dynamic-attr'
import { fixture as childComponentInit } from './child-component-init'
import { fixture as reactivePropBinding } from './reactive-prop-binding'
import { fixture as localRecordUnionIndex } from './local-record-union-index'
import { fixture as recordIndexLookup } from './record-index-lookup'
import { fixture as recordIndexLookupViaChildProp } from './record-index-lookup-via-child-prop'
// Priority 9: Provider / Async (IR-kind coverage, #1252 Phase 0)
import { fixture as contextProvider } from './context-provider'
// #2087: Provider value member falling back to an empty object literal via
// `?? {}` — the exact chart `ChartConfigContext.Provider` shape.
import { fixture as contextProviderNullishObjectFallback } from './context-provider-nullish-object-fallback'
import { fixture as asyncBoundary } from './async-boundary'
import { fixture as regionBoundary } from './region-boundary'
import { fixture as searchParamsFixture } from './search-params'
import { fixture as searchParamsDerivedMemo } from './search-params-derived-memo'
import { fixture as searchParamsDerivedMemoBare } from './search-params-derived-memo-bare'
import { fixture as searchParamsDerivedFilter } from './search-params-derived-filter'
// Priority 10: Compiler stress catalog (#1244)
import { fixture as style3Signals } from './style-3-signals'
import { fixture as jsxSpreadReactive } from './jsx-spread-reactive'
import { fixture as jsxSpreadMultiple } from './jsx-spread-multiple'
import { fixture as jsxSpreadStaticAndSpread } from './jsx-spread-static-and-spread'
import { fixture as jsxSpreadRestProp } from './jsx-spread-rest-prop'
import { fixture as jsxSpreadPropsObject } from './jsx-spread-props-object'
import { fixture as taggedTemplateClassname } from './tagged-template-classname'
import { fixture as memberExpressionTag } from './member-expression-tag'
import { fixture as arrowComponent } from './arrow-component'
import { fixture as childrenJsxExpression } from './children-jsx-expression'
import { fixture as fragmentWrappedChildrenJsxExpression } from './fragment-wrapped-children-jsx-expression'
import { fixture as restDestructureObjectInMap } from './rest-destructure-object-in-map'
import { fixture as restDestructureObjectSpreadInMap } from './rest-destructure-object-spread-in-map'
import { fixture as restDestructureArrayInMap } from './rest-destructure-array-in-map'
import { fixture as restDestructureNestedInMap } from './rest-destructure-nested-in-map'
// #2087: fixed-binding (no-rest) destructure shapes admitted by
// `isLowerableLoopDestructure`'s `segments`-based gate — array-index
// (tuple) and nested-object-path destructure. All seven template adapters
// (Go/Mojo/Xslate/Twig/Jinja/ERB/Rust) lower these via their
// `segments`-based accessor emitters; Hono/CSR lowered them all along.
import { fixture as destructureArrayIndexInMap } from './destructure-array-index-in-map'
import { fixture as destructureNestedObjectInMap } from './destructure-nested-object-in-map'
// Priority 11: JS Array / String method lowering (#1448 Tier A).
// One fixture per method — every adapter starts pinned with BF101 in
// its own `expectedDiagnostics`, and each method PR removes its row
// once the lowering lands. Hono / CSR pass these out of the box
// (they evaluate JS at runtime), so the pinning only applies to the
// template-language adapters (Mojo, Go).
import { fixture as arrayIncludes } from './methods/array-includes'
import { fixture as arrayIndexOf } from './methods/array-indexOf'
import { fixture as arrayLastIndexOf } from './methods/array-lastIndexOf'
import { fixture as arrayAt } from './methods/array-at'
import { fixture as arrayConcat } from './methods/array-concat'
import { fixture as arraySlice } from './methods/array-slice'
// #1448 full-arity — zero-arg default forms.
import { fixture as arraySliceCopy } from './methods/array-slice-copy'
import { fixture as arrayJoinDefault } from './methods/array-join-default'
import { fixture as arrayAtDefault } from './methods/array-at-default'
import { fixture as arrayConcatCopy } from './methods/array-concat-copy'
import { fixture as arrayReverse } from './methods/array-reverse'
import { fixture as arrayToReversed } from './methods/array-toReversed'
// #1448 Tier C — .flat(depth?).
import { fixture as arrayFlat } from './methods/array-flat'
import { fixture as arrayFlatDepth } from './methods/array-flat-depth'
import { fixture as arrayFlatInfinity } from './methods/array-flat-infinity'
import { fixture as arrayFlatMapField } from './methods/array-flatmap-field'
import { fixture as arrayMapValueTemplate } from './methods/array-map-value-template'
import { fixture as arrayMapValueField } from './methods/array-map-value-field'
import { fixture as arrayMapFunctionReference } from './methods/array-map-function-reference'
import { fixture as arrayFlatMapSelf } from './methods/array-flatmap-self'
import { fixture as arrayFlatMapTuple } from './methods/array-flatmap-tuple'
// #2094 — dynamic `.flat(depth)` + evaluator nested-callback widening
// (`.map`/`.filter`/`.join` inside a flatMap projection or filter
// predicate) + the 2-arg `flatMap(fn, thisArg)` pin. All six runtime
// evaluators implement the widened surface (Go is the reference; parity
// is pinned by the `flat_dynamic` helper vectors and the #2094 eval
// vectors), so these run on every adapter.
import { fixture as arrayFlatDynamicDepth } from './methods/array-flat-dynamic-depth'
import { fixture as arrayFlatMapNestedMap } from './methods/array-flatmap-nested-map'
import { fixture as arrayFlatMapNestedFilterJoin } from './methods/array-flatmap-nested-filter-join'
import { fixture as arrayFlatMapThisArg } from './methods/array-flatmap-thisarg'
import { fixture as stringToLowerCase } from './methods/string-toLowerCase'
import { fixture as stringToUpperCase } from './methods/string-toUpperCase'
import { fixture as stringTrim } from './methods/string-trim'
import { fixture as stringIncludes } from './methods/string-includes'
// #1448 Tier B — String methods.
import { fixture as stringSplit } from './methods/string-split'
import { fixture as stringSplitLimit } from './methods/string-split-limit'
import { fixture as stringStartsWith } from './methods/string-startsWith'
import { fixture as stringStartsWithPosition } from './methods/string-startsWith-position'
import { fixture as stringEndsWith } from './methods/string-endsWith'
import { fixture as stringEndsWithPosition } from './methods/string-endsWith-position'
import { fixture as stringReplace } from './methods/string-replace'
import { fixture as stringRepeat } from './methods/string-repeat'
import { fixture as stringPadStart } from './methods/string-padStart'
import { fixture as stringPadEnd } from './methods/string-padEnd'
// #1448 catalog parity: array methods rendered positively by
// Hono / CSR (runtime JS) and at least one SSR adapter — pinning
// the canonical surface so a regression surfaces here instead of
// through whichever downstream fixture happens to compose the
// same call. Per-adapter pins live in each adapter's test file
// (Mojo's `expectedDiagnostics` set, Go's `skipJsx` list):
//   - `.every` / `.some`              — positive across all adapters
//   - `.join`                         — positive across all adapters
//                                       (Mojo `array-method` IR
//                                       emits `join(sep, @{arr})`;
//                                       Go's `bf_join` helper)
//   - `.find` / `.findIndex`          — positive on Hono / CSR / Go;
//                                       Mojo has no lowering yet
//                                       (`array-method` extension /
//                                       BF101 pin in mojo-adapter.test)
import { fixture as arrayJoin } from './methods/array-join'
import { fixture as arrayFind } from './methods/array-find'
import { fixture as arrayEvery } from './methods/array-every'
import { fixture as arraySome } from './methods/array-some'
import { fixture as arrayFindIndex } from './methods/array-findIndex'
import { fixture as arrayFindLast } from './methods/array-findLast'
import { fixture as arrayFindLastIndex } from './methods/array-findLastIndex'
// #1448 Tier B — `.sort` / `.toSorted` lowering. The Tier A
// fixtures above gated the standalone-method surface; Tier B
// adds the comparator-bearing variants (field-based numeric,
// primitive numeric, primitive string via `.localeCompare`) plus
// the non-mutating `.toSorted` alias.
import { fixture as arraySortFieldAsc } from './methods/array-sort-field-asc'
import { fixture as arraySortFieldDesc } from './methods/array-sort-field-desc'
import { fixture as arraySortPrimitive } from './methods/array-sort-primitive'
import { fixture as arraySortLocale } from './methods/array-sort-locale'
import { fixture as arraySortMultiKey } from './methods/array-sort-multikey'
import { fixture as arraySortTernary } from './methods/array-sort-ternary'
import { fixture as arrayToSorted } from './methods/array-toSorted'
import { fixture as arraySortFnRef } from './methods/array-sort-fnref'
// #1448 Tier C — `.reduce(fn, init)` arithmetic-fold catalogue. Numeric
// sum / product over a field or primitive `self`, plus string concat.
// Lowers via the `array-method` + `ReduceOp` IR and the `bf_reduce`
// (Go) / `bf->reduce` (Mojo) runtime helpers.
import { fixture as reduceSumField } from './methods/reduce-sum-field'
import { fixture as reduceSumSelf } from './methods/reduce-sum-self'
import { fixture as reduceConcat } from './methods/reduce-concat'
import { fixture as reduceProduct } from './methods/reduce-product'
import { fixture as reduceRightConcat } from './methods/reduce-right-concat'
// #1448 Tier B — `.entries()` / `.keys()` / `.values()` iteration shapes.
// The compiler strips the iterator method from the chain and synthesises
// proper loop bindings so adapters emit native index+value iteration.
import { fixture as arrayEntries } from './methods/array-entries'
import { fixture as arrayKeys } from './methods/array-keys'
import { fixture as arrayValues } from './methods/array-values'
// Priority 12: Edge-case sweep (adapter-coverage 炙り出し). Broad probes
// for JSX semantics the corpus didn't yet pin — falsy children, JSX
// comments/whitespace/entities, unicode, expression operators, attribute
// name/typing rules, SVG/custom elements, loop/conditional nestings,
// composition depth, and string-method gaps. Shapes an adapter can't
// lower are pinned per-adapter (skipJsx / conformance-pins), never here.
import { fixture as falsyTextValues } from './falsy-text-values'
import { fixture as jsxCommentChild } from './jsx-comment-child'
import { fixture as jsxTextWhitespace } from './jsx-text-whitespace'
import { fixture as unicodeText } from './unicode-text'
import { fixture as htmlEntityText } from './html-entity-text'
import { fixture as arithmeticText } from './arithmetic-text'
import { fixture as comparisonTernaryText } from './comparison-ternary-text'
import { fixture as unaryNotBinding } from './unary-not-binding'
import { fixture as stringConcatPlus } from './string-concat-plus'
import { fixture as stringConcatPlusIdentifiers } from './string-concat-plus-identifiers'
import { fixture as templateLiteralMultiInterp } from './template-literal-multi-interp'
import { fixture as optionalChainingProp } from './optional-chaining-prop'
import { fixture as numberToFixed } from './number-tofixed'
import { fixture as mathMethods } from './math-methods'
import { fixture as stringLengthText } from './string-length-text'
import { fixture as booleanAttrLiterals } from './boolean-attr-literals'
import { fixture as camelcaseAttributes } from './camelcase-attributes'
import { fixture as staticAttrEscape } from './static-attr-escape'
import { fixture as svgIcon } from './svg-icon'
import { fixture as customElementTag } from './custom-element-tag'
import { fixture as dataAriaValues } from './data-aria-values'
import { fixture as attrTernaryTitle } from './attr-ternary-title'
import { fixture as logicalAndChain } from './logical-and-chain'
import { fixture as emptyListBranch } from './empty-list-branch'
import { fixture as adjacentConditionals } from './adjacent-conditionals'
import { fixture as conditionalWrappingLoop } from './conditional-wrapping-loop'
import { fixture as elseIfChain } from './else-if-chain'
import { fixture as inlineArrayMap } from './inline-array-map'
import { fixture as objectEntriesMap } from './object-entries-map'
import { fixture as mapKeyIndex } from './map-key-index'
import { fixture as mapIndexHandler } from './map-index-handler'
import { fixture as nestedMapIndexKey } from './nested-map-index-key'
import { fixture as nestedLoopOuterBinding } from './nested-loop-outer-binding'
import { fixture as nestedLoopTripleDepth } from './nested-loop-triple-depth'
import { fixture as svgInnerLoop } from './svg-inner-loop'
import { fixture as siblingLoopsKeyIsolation } from './sibling-loops-key-isolation'
import { fixture as conditionalReturnNull } from './conditional-return-null'
import { fixture as jsxElementProp } from './jsx-element-prop'
import { fixture as grandchildComposition } from './grandchild-composition'
import { fixture as childPrimitiveProps } from './child-primitive-props'
import { fixture as preWhitespace } from './pre-whitespace'
import { fixture as tableDynamicRows } from './table-dynamic-rows'
import { fixture as adjacentDynamicText } from './adjacent-dynamic-text'
import { fixture as memoChain } from './memo-chain'
import { fixture as signalObjectField } from './signal-object-field'
import { fixture as nestedFragments } from './nested-fragments'
import { fixture as deepNesting } from './deep-nesting'
import { fixture as signalAttrAndText } from './signal-attr-and-text'
import { fixture as selectOptionSelected } from './select-option-selected'
import { fixture as dangerousInnerHtml } from './dangerous-inner-html'
import { fixture as dangerousInnerHtmlDynamic } from './dangerous-inner-html-dynamic'
import { fixture as multilineAttrValue } from './multiline-attr-value'
import { fixture as stringSlice } from './methods/string-slice'
import { fixture as stringReplaceAll } from './methods/string-replaceall'
import { fixture as stringTrimSided } from './methods/string-trim-sided'
// #2212/#2221/#2222: cross-adapter conformance for a `.map()` callback
// param shadowing an outer destructured prop, with the loop's array
// source itself a destructured prop — couldn't be added until both the
// CSR `setArray` fallback fix (#2222 bug 1) and the scope-accurate
// prop/const shadowing fixes (#2221, #2222 bug 2) landed.
import { fixture as loopParamShadowsOuterName } from './loop-param-shadows-outer-name'
import { fixture as loopParamShadowsConstKey } from './loop-param-shadows-const-key'
// #2228 (PR #2240): filter-predicate wrapper-Props datum-field
// qualification, made reachable by a non-'all' default filter (a
// same-file child component avoids the BF103 sibling-import refusal).
import { fixture as filterWrapperPropsReachable } from './filter-wrapper-props-reachable'
// #2245: the un-routed-around twin of `filterWrapperPropsReachable` above —
// same shape, but keeps the filter/map callbacks' ORIGINALLY differently-
// named params (`t` / `todo`) instead of renaming to dodge the ERB-only
// `ErbFilterEmitter` ID-matching bug that naming previously routed around.
import { fixture as filterParamNameDiffers } from './filter-param-name-differs'
// #2237 (PR #2241): a `.map()` callback param shadows a module-scope
// object const; every Twig-family adapter used to bake the const's
// literal into each iteration instead of reading the loop's own item.
import { fixture as loopParamShadowsRecordConst } from './loop-param-shadows-record-const'
import { fixture as dateMethodUncatalogued } from './date-method-uncatalogued'
import { fixture as dateCatalogued } from './date-catalogued'
import { fixture as formatDate } from './format-date'
import { fixture as dateToLocaleLiteral } from './date-tolocale-literal'
import { fixture as dateToLocaleUnion } from './date-tolocale-union'
import { fixture as dateToLocaleDateStyle } from './date-tolocale-datestyle'
import { fixture as dateToLocaleNamedTz } from './date-tolocale-named-tz'
// #2277: the union- and object-typed catalogue extensions to the
// type-derived adversarial catalogue (`adversarial-catalog.ts`), mirroring
// the landed Date catalogue work above.
import { fixture as unionCatalogued } from './union-catalogued'
import { fixture as objectCatalogued } from './object-catalogued'

import type { JSXFixture } from '../src/types'

export const jsxFixtures: JSXFixture[] = [
  counter,
  reactiveFactoryObjectReturn,
  counterShared,
  toggleShared,
  conditionalReturnButton,
  conditionalReturnLink,
  reactiveProps,
  propsReactivityComparison,
  form,
  portal,
  todoApp,
  todoAppSsr,
  aiChat,
  button,
  // #1467 Phase 2b: basic interactive `site/ui` primitives.
  toggle,
  switchFixture,
  checkbox,
  input,
  textarea,
  label,
  kbd,
  radioGroup,
  accordion,
  tabs,
  dialog,
  popover,
  tooltip,
  select,
  dropdownMenu,
  combobox,
  command,
  pagination,
  dataTable,
  textEscape,
  // Priority 1: Core reactivity
  signalWithFallback,
  signalDefaultFromJsx,
  controlledSignal,
  signalPropSameName,
  memo,
  effect,
  multipleSignals,
  // Priority 2: Props and composition
  propsStatic,
  propsReactive,
  nestedElements,
  // Priority 3: Conditionals
  ternary,
  nestedTernary,
  conditionPositionTernary,
  topLevelTernary,
  logicalAnd,
  conditionalClass,
  ifStatement,
  // Priority 4: Loops
  mapBasic,
  mapWithIndex,
  filterSimple,
  filterNestedCallbackPredicate,
  filterNestedCallbackPredicateClient,
  filterTypeofPredicate,
  filterTypeofPredicateClient,
  filterNestedFindPredicate,
  fillUnsupported,
  findTypeofPredicate,
  someTypeofPredicate,
  everyTypeofPredicate,
  reduceTypeofBody,
  reduceRightTypeofBody,
  flatMapTypeofProjection,
  mapIfChainBody,
  sortSimple,
  filterSortChain,
  mapNested,
  mapDynamicClass,
  siblingMaps,
  fragmentLoopChildren,
  // Priority 5: Elements and attributes
  voidElements,
  dynamicAttributes,
  classVsClassname,
  styleAttribute,
  styleObjectStatic,
  styleObjectDynamic,
  // Priority 6: Advanced patterns
  fragment,
  fragmentConditional,
  loopItemConditional,
  clientOnly,
  clientOnlyLoop,
  clientOnlyLoopWithSiblingCond,
  eventHandlers,
  defaultProps,
  untypedPropsReads,
  bareTextOptionalScalar,
  nullishCoalescingText,
  nullishCoalescingDestructured,
  nullishCoalescingJsx,
  logicalOrJsx,
  branchSelfClosing,
  branchMap,
  branchLocalFilterJoin,
  returnLogicalAnd,
  returnLogicalOr,
  returnNullishCoalescing,
  returnMap,
  // Priority 7: Multi-file composition
  childComponent,
  multiComponentModule,
  restSpreadChildAttrs,
  componentWithJsxChildren,
  counterButtons,
  nativeSelectSpreadChildren,
  multipleInstances,
  staticArrayChildren,
  staticArrayOfObjectsElementBody,
  staticArrayFromProps,
  staticArrayFromPropsWithComponent,
  // Priority 8: CSR conformance
  booleanDynamicAttr,
  childComponentInit,
  reactivePropBinding,
  localRecordUnionIndex,
  recordIndexLookup,
  recordIndexLookupViaChildProp,
  // Priority 9: Provider / Async (IR-kind coverage, #1252 Phase 0)
  contextProvider,
  contextProviderNullishObjectFallback,
  asyncBoundary,
  regionBoundary,
  searchParamsFixture,
  searchParamsDerivedMemo,
  searchParamsDerivedMemoBare,
  searchParamsDerivedFilter,
  // Priority 10: Compiler stress catalog (#1244)
  style3Signals,
  jsxSpreadReactive,
  jsxSpreadMultiple,
  jsxSpreadStaticAndSpread,
  jsxSpreadRestProp,
  jsxSpreadPropsObject,
  taggedTemplateClassname,
  memberExpressionTag,
  arrowComponent,
  childrenJsxExpression,
  fragmentWrappedChildrenJsxExpression,
  // #1310: rest destructure in .map() — Hono/CSR lowers via #1309,
  // Go/Mojo refuse the loop destructure shape with BF104.
  restDestructureObjectInMap,
  // #1244 catalog: rest spread back onto the root element. Same
  // adapter contract as the read-only variant above (Hono/CSR via
  // #1309, Go/Mojo BF104).
  restDestructureObjectSpreadInMap,
  restDestructureArrayInMap,
  restDestructureNestedInMap,
  // #2087 Phase A: fixed-binding (no-rest) destructure — array-index / nested.
  destructureArrayIndexInMap,
  destructureNestedObjectInMap,
  // #1448 Tier A — Array methods.
  arrayIncludes,
  arrayIndexOf,
  arrayLastIndexOf,
  arrayAt,
  arrayConcat,
  arraySlice,
  arraySliceCopy,
  arrayJoinDefault,
  arrayAtDefault,
  arrayConcatCopy,
  arrayReverse,
  arrayToReversed,
  arrayFlat,
  arrayFlatDepth,
  arrayFlatInfinity,
  arrayFlatMapField,
  arrayMapValueTemplate,
  arrayMapValueField,
  arrayMapFunctionReference,
  arrayFlatMapSelf,
  arrayFlatMapTuple,
  // #2094
  arrayFlatDynamicDepth,
  arrayFlatMapNestedMap,
  arrayFlatMapNestedFilterJoin,
  arrayFlatMapThisArg,
  // #1448 Tier A — String methods.
  stringToLowerCase,
  stringToUpperCase,
  stringTrim,
  stringIncludes,
  // #1448 Tier B — String methods.
  stringSplit,
  stringSplitLimit,
  stringStartsWith,
  stringStartsWithPosition,
  stringEndsWith,
  stringEndsWithPosition,
  stringReplace,
  stringRepeat,
  stringPadStart,
  stringPadEnd,
  // #1448 catalog parity — already-lowered Array methods.
  arrayJoin,
  arrayFind,
  arrayEvery,
  arraySome,
  arrayFindIndex,
  arrayFindLast,
  arrayFindLastIndex,
  // #1448 Tier B — sort / toSorted with structured comparator.
  arraySortFieldAsc,
  reduceSumField,
  reduceSumSelf,
  reduceConcat,
  reduceProduct,
  reduceRightConcat,
  arraySortFieldDesc,
  arraySortPrimitive,
  arraySortLocale,
  arraySortMultiKey,
  arraySortTernary,
  arrayToSorted,
  arraySortFnRef,
  arrayEntries,
  arrayKeys,
  arrayValues,
  // Priority 12: Edge-case sweep (adapter-coverage 炙り出し).
  falsyTextValues,
  jsxCommentChild,
  jsxTextWhitespace,
  unicodeText,
  htmlEntityText,
  arithmeticText,
  comparisonTernaryText,
  unaryNotBinding,
  stringConcatPlus,
  stringConcatPlusIdentifiers,
  templateLiteralMultiInterp,
  optionalChainingProp,
  numberToFixed,
  mathMethods,
  stringLengthText,
  booleanAttrLiterals,
  camelcaseAttributes,
  staticAttrEscape,
  svgIcon,
  customElementTag,
  dataAriaValues,
  attrTernaryTitle,
  logicalAndChain,
  emptyListBranch,
  adjacentConditionals,
  conditionalWrappingLoop,
  elseIfChain,
  inlineArrayMap,
  objectEntriesMap,
  mapKeyIndex,
  mapIndexHandler,
  nestedMapIndexKey,
  nestedLoopOuterBinding,
  nestedLoopTripleDepth,
  svgInnerLoop,
  siblingLoopsKeyIsolation,
  conditionalReturnNull,
  jsxElementProp,
  grandchildComposition,
  childPrimitiveProps,
  preWhitespace,
  tableDynamicRows,
  adjacentDynamicText,
  memoChain,
  signalObjectField,
  nestedFragments,
  deepNesting,
  signalAttrAndText,
  selectOptionSelected,
  dangerousInnerHtml,
  dangerousInnerHtmlDynamic,
  multilineAttrValue,
  stringSlice,
  stringReplaceAll,
  stringTrimSided,
  loopParamShadowsOuterName,
  loopParamShadowsConstKey,
  filterWrapperPropsReachable,
  filterParamNameDiffers,
  loopParamShadowsRecordConst,
  dateMethodUncatalogued,
  dateCatalogued,
  formatDate,
  dateToLocaleLiteral,
  dateToLocaleUnion,
  dateToLocaleDateStyle,
  dateToLocaleNamedTz,
  unionCatalogued,
  objectCatalogued,
]
