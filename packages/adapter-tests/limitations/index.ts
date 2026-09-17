/**
 * The registry index — every `limitations/<id>.ts` entry keyed by its id.
 *
 * Kept explicit (no directory glob at import time) so the map is plain
 * TypeScript any tool can import synchronously; `limitations.test.ts`
 * asserts the directory listing and these keys agree, so a new file
 * that is not registered here fails loudly instead of being invisible.
 */

import type { Limitation, LimitationSpec } from '../src/limitations'
import ambientLocaleDateFormatting from './ambient-locale-date-formatting'
import arrayFill from './array-fill'
import booleanInStaticLoopItem from './boolean-in-static-loop-item'
import computedConstLoopSource from './computed-const-loop-source'
import derivedObjectLiteralSignal from './derived-object-literal-signal'
import jsxWrappedInNonChildrenProp from './jsx-wrapped-in-non-children-prop'
import moduleScopeHelperCall from './module-scope-helper-call'
import namespaceImportPrimitiveWithoutProgram from './namespace-import-primitive-without-program'
import nestedCallbackInFilterPredicate from './nested-callback-in-filter-predicate'
import offSubsetCallbackBody from './off-subset-callback-body'
import richTypedPropHydration from './rich-typed-prop-hydration'
import signalReadInNestedStaticLoop from './signal-read-in-nested-static-loop'
import statementBodyCallback from './statement-body-callback'

const specs: Readonly<Record<string, LimitationSpec>> = {
  'ambient-locale-date-formatting': ambientLocaleDateFormatting,
  'array-fill': arrayFill,
  'boolean-in-static-loop-item': booleanInStaticLoopItem,
  'computed-const-loop-source': computedConstLoopSource,
  'derived-object-literal-signal': derivedObjectLiteralSignal,
  'jsx-wrapped-in-non-children-prop': jsxWrappedInNonChildrenProp,
  'module-scope-helper-call': moduleScopeHelperCall,
  'namespace-import-primitive-without-program': namespaceImportPrimitiveWithoutProgram,
  'nested-callback-in-filter-predicate': nestedCallbackInFilterPredicate,
  'off-subset-callback-body': offSubsetCallbackBody,
  'rich-typed-prop-hydration': richTypedPropHydration,
  'signal-read-in-nested-static-loop': signalReadInNestedStaticLoop,
  'statement-body-callback': statementBodyCallback,
}

/** Every registered limitation, id attached, sorted by id. */
export const limitations: readonly Limitation[] = Object.keys(specs)
  .sort()
  .map(id => ({ id, ...specs[id] }))

/** Registry lookup by id; `undefined` for an unknown id (the join test turns that into a failure). */
export function findLimitation(id: string): Limitation | undefined {
  return limitations.find(l => l.id === id)
}
