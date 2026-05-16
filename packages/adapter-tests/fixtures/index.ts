import { fixture as counter } from './counter'
// Priority 1: Core reactivity
import { fixture as signalWithFallback } from './signal-with-fallback'
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
import { fixture as topLevelTernary } from './top-level-ternary'
import { fixture as logicalAnd } from './logical-and'
import { fixture as conditionalClass } from './conditional-class'
import { fixture as ifStatement } from './if-statement'
// Priority 4: Loops
import { fixture as mapBasic } from './map-basic'
import { fixture as mapWithIndex } from './map-with-index'
import { fixture as filterSimple } from './filter-simple'
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
import { fixture as clientOnly } from './client-only'
import { fixture as clientOnlyLoopWithSiblingCond } from './client-only-loop-with-sibling-cond'
import { fixture as eventHandlers } from './event-handlers'
import { fixture as defaultProps } from './default-props'
import { fixture as nullishCoalescingText } from './nullish-coalescing-text'
import { fixture as nullishCoalescingJsx } from './nullish-coalescing-jsx'
import { fixture as logicalOrJsx } from './logical-or-jsx'
import { fixture as branchSelfClosing } from './branch-self-closing'
import { fixture as branchMap } from './branch-map'
import { fixture as returnLogicalAnd } from './return-logical-and'
import { fixture as returnLogicalOr } from './return-logical-or'
import { fixture as returnNullishCoalescing } from './return-nullish-coalescing'
import { fixture as returnMap } from './return-map'
// Priority 7: Multi-file composition
import { fixture as childComponent } from './child-component'
import { fixture as componentWithJsxChildren } from './component-with-jsx-children'
import { fixture as multipleInstances } from './multiple-instances'
import { fixture as staticArrayChildren } from './static-array-children'
import { fixture as staticArrayFromProps } from './static-array-from-props'
import { fixture as staticArrayFromPropsWithComponent } from './static-array-from-props-with-component'
// Priority 8: CSR conformance
import { fixture as booleanDynamicAttr } from './boolean-dynamic-attr'
import { fixture as childComponentInit } from './child-component-init'
import { fixture as reactivePropBinding } from './reactive-prop-binding'
import { fixture as recordIndexLookup } from './record-index-lookup'
import { fixture as recordIndexLookupViaChildProp } from './record-index-lookup-via-child-prop'
// Priority 9: Provider / Async (IR-kind coverage, #1252 Phase 0)
import { fixture as contextProvider } from './context-provider'
import { fixture as asyncBoundary } from './async-boundary'
// Priority 10: Compiler stress catalog (#1244)
import { fixture as style3Signals } from './style-3-signals'
import { fixture as jsxSpreadReactive } from './jsx-spread-reactive'
import { fixture as taggedTemplateClassname } from './tagged-template-classname'
import { fixture as memberExpressionTag } from './member-expression-tag'
import { fixture as arrowComponent } from './arrow-component'
import { fixture as childrenJsxExpression } from './children-jsx-expression'
import { fixture as restDestructureObjectInMap } from './rest-destructure-object-in-map'
import { fixture as restDestructureArrayInMap } from './rest-destructure-array-in-map'
import { fixture as restDestructureNestedInMap } from './rest-destructure-nested-in-map'

import type { JSXFixture } from '../src/types'

export const jsxFixtures: JSXFixture[] = [
  counter,
  // Priority 1: Core reactivity
  signalWithFallback,
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
  topLevelTernary,
  logicalAnd,
  conditionalClass,
  ifStatement,
  // Priority 4: Loops
  mapBasic,
  mapWithIndex,
  filterSimple,
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
  clientOnly,
  clientOnlyLoopWithSiblingCond,
  eventHandlers,
  defaultProps,
  nullishCoalescingText,
  nullishCoalescingJsx,
  logicalOrJsx,
  branchSelfClosing,
  branchMap,
  returnLogicalAnd,
  returnLogicalOr,
  returnNullishCoalescing,
  returnMap,
  // Priority 7: Multi-file composition
  childComponent,
  componentWithJsxChildren,
  multipleInstances,
  staticArrayChildren,
  staticArrayFromProps,
  staticArrayFromPropsWithComponent,
  // Priority 8: CSR conformance
  booleanDynamicAttr,
  childComponentInit,
  reactivePropBinding,
  recordIndexLookup,
  recordIndexLookupViaChildProp,
  // Priority 9: Provider / Async (IR-kind coverage, #1252 Phase 0)
  contextProvider,
  asyncBoundary,
  // Priority 10: Compiler stress catalog (#1244)
  style3Signals,
  jsxSpreadReactive,
  taggedTemplateClassname,
  memberExpressionTag,
  arrowComponent,
  childrenJsxExpression,
  // #1310: rest destructure in .map() — Hono/CSR lowers via #1309,
  // Go/Mojo refuse the loop destructure shape with BF104.
  restDestructureObjectInMap,
  restDestructureArrayInMap,
  restDestructureNestedInMap,
]
