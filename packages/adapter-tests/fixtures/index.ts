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
import { fixture as multipleInstances } from './multiple-instances'
import { fixture as staticArrayChildren } from './static-array-children'
// Priority 8: CSR conformance
import { fixture as booleanDynamicAttr } from './boolean-dynamic-attr'
import { fixture as childComponentInit } from './child-component-init'
import { fixture as reactivePropBinding } from './reactive-prop-binding'

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
  multipleInstances,
  staticArrayChildren,
  // Priority 8: CSR conformance
  booleanDynamicAttr,
  childComponentInit,
  reactivePropBinding,
]
