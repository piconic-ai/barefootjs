/**
 * Template-inlinability classifier for local constants and local
 * functions.
 *
 * Answers two boundary questions the template emitter asks per name:
 *
 *   (a) Can this constant be inlined verbatim into the generated
 *       template HTML? — e.g. `const cls = 'layer-x:p-2'` can;
 *       `const f = () => 0` cannot (arrow literal, runtime value).
 *   (b) Is this name unsafe to reference by its bare identifier inside
 *       a template expression? — module-scope functions that do NOT
 *       reference component-scope names are safe; anything else is not.
 *
 * Pre-Stage E.4 this was a 110-line cascade inside
 * `buildInlinableConstants` mixing three independent sub-decisions
 * (emission scope, template safety, scope visibility) without named
 * outcomes. Now each sub-decision returns a tagged status so the
 * cascade reads as a flat list of rules. The legacy `{
 * inlinableConstants, unsafeLocalNames }` shape is reconstructed at
 * the boundary — downstream consumers (static/CSR template
 * generation, chained-ref resolution) are byte-identical.
 *
 * Stage E.4 of issue #1021.
 */

import type { ConstantInfo, ReferencesGraph } from '../types'
import type { ClientJsContext } from './types'
import { graphFunctionReferences } from './build-references'

/**
 * Why a local constant was or was not chosen for template inlining.
 * Order of evaluation mirrors the pre-Stage E.4 cascade so the
 * decision set is byte-identical.
 */
export type ConstantInlinability =
  | { kind: 'inlinable'; value: string }
  /** JSX literal — already inlined at IR level (#547); not part of
   *  the constants emission at all. */
  | { kind: 'jsx-inline' }
  /** System unique-identity construct (`createContext()`, `new WeakMap()`).
   *  Not a template value and not unsafe either — emitted at module
   *  scope, queried by name at runtime. */
  | { kind: 'system-construct' }
  /** `let x;` with no initializer, or analysis is missing a value we
   *  need to inline. Safe to emit, unsafe to inline. */
  | { kind: 'placeholder-let' }
  /** Initializer contains an arrow or function expression (AST flag).
   *  The function identity is per-instance; inlining a function
   *  literal into a template would close over the wrong scope. */
  | { kind: 'arrow-literal' }
  /** Initializer reads a signal/memo. Template inlining would freeze
   *  the reactive value at SSR time. */
  | { kind: 'reactive-read' }
  /** Free identifiers include names outside `graph.declaredNames` —
   *  e.g. a file-scope helper or an import. Not visible at template
   *  module scope. */
  | { kind: 'external-name' }
  /** After chained-ref resolution, the inlined value still mentions
   *  a name classified unsafe above. Transitive demotion. */
  | { kind: 'depends-on-unsafe' }

export type FunctionInlinability =
  /** Module-scope function that does NOT touch component internals —
   *  the template can reference it by bare name because the emitted
   *  client JS puts it at module scope too. */
  | { kind: 'module-scope-safe' }
  /** Module-scope function that DOES touch component internals, OR
   *  any per-instance (isModule !== true) function. Its identity is
   *  per-instance or its closure pulls component-local names the
   *  template cannot see — either way, unsafe for template inlining. */
  | { kind: 'references-component-scope' }

export interface InlinabilityAnalysis {
  constants: Map<string, ConstantInlinability>
  functions: Map<string, FunctionInlinability>
}

// JavaScript built-in identifiers that are always available at any scope.
// Names in this set never mark a constant `external-name`.
const JS_BUILTINS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'typeof', 'instanceof', 'void', 'delete', 'new', 'in', 'of',
  'this', 'super', 'return', 'throw', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
  'try', 'catch', 'finally', 'yield', 'await', 'async',
  'let', 'const', 'var', 'function', 'class',
  'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Date', 'RegExp', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise',
  'Error', 'TypeError', 'RangeError', 'SyntaxError',
  'console', 'window', 'document', 'globalThis', 'navigator',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame',
  'Symbol', 'Proxy', 'Reflect', 'BigInt',
])

/**
 * Classify each local constant and local function according to the
 * tagged-union statuses above. Pure function: no IR mutation.
 *
 * Evaluation order for constants mirrors the pre-Stage E.4 cascade so
 * the downstream inlinable / unsafe sets are byte-identical.
 */
export function computeInlinability(
  ctx: ClientJsContext,
  graph: ReferencesGraph,
): InlinabilityAnalysis {
  const constants = new Map<string, ConstantInlinability>()
  const functions = new Map<string, FunctionInlinability>()

  // --- Functions ---
  for (const fn of ctx.localFunctions) {
    functions.set(fn.name, fn.isModule && !functionReferencesDeclaredName(graph, fn.name)
      ? { kind: 'module-scope-safe' }
      : { kind: 'references-component-scope' })
  }

  // --- Constants (initial classification) ---
  const signalGetters = new Set(ctx.signals.map(s => s.getter))
  const signalSetters = new Set(ctx.signals.filter(s => s.setter).map(s => s.setter!))
  const memoNames = new Set(ctx.memos.map(m => m.name))

  for (const c of ctx.localConstants) {
    constants.set(c.name, classifyConstantInitial(
      c,
      graph.declaredNames,
      signalGetters,
      signalSetters,
      memoNames,
    ))
  }

  return { constants, functions }
}

function classifyConstantInitial(
  c: ConstantInfo,
  declaredNames: Set<string>,
  signalGetters: Set<string>,
  signalSetters: Set<string>,
  memoNames: Set<string>,
): ConstantInlinability {
  if (c.isJsx) return { kind: 'jsx-inline' }
  if (!c.value) return { kind: 'placeholder-let' }
  if (c.containsArrow) return { kind: 'arrow-literal' }
  if (c.systemConstructKind) return { kind: 'system-construct' }

  const freeIds = c.freeIdentifiers
  if (freeIds) {
    for (const id of freeIds) {
      if (signalGetters.has(id) || signalSetters.has(id) || memoNames.has(id)) {
        return { kind: 'reactive-read' }
      }
    }
    for (const id of freeIds) {
      if (JS_BUILTINS.has(id) || declaredNames.has(id)) continue
      return { kind: 'external-name' }
    }
  }

  return {
    kind: 'inlinable',
    value: c.templateValue?.trim() ?? c.value.trim(),
  }
}

function functionReferencesDeclaredName(graph: ReferencesGraph, fnName: string): boolean {
  const refs = graphFunctionReferences(graph, fnName)
  for (const r of refs) {
    if (graph.declaredNames.has(r)) return true
  }
  return false
}

/**
 * Convert the tagged-union analysis back into the legacy shape the
 * rest of the template pipeline expects: a map of inlinable constants
 * keyed by name, plus a Set of names the template must fall back to
 * runtime for. Chained-ref resolution runs here too — a constant whose
 * final resolved value still mentions an unsafe name is downgraded to
 * `depends-on-unsafe`.
 *
 * Any callsite that needs the structured statuses can read
 * `analysis.constants` / `analysis.functions` directly — the adapter
 * below is purely for byte-identical compat with the pre-Stage E.4
 * consumers.
 */
export function toLegacyInlinability(
  analysis: InlinabilityAnalysis,
  resolveChained: (constants: Map<string, string>, freeIdsMap: Map<string, Set<string>>) => void,
  ctx: ClientJsContext,
  exprReferencesIdent: (expr: string, ident: string) => boolean,
): {
  inlinableConstants: Map<string, string>
  unsafeLocalNames: Set<string>
} {
  const inlinableConstants = new Map<string, string>()
  const unsafeLocalNames = new Set<string>()

  for (const [name, status] of analysis.constants) {
    if (status.kind === 'inlinable') {
      inlinableConstants.set(name, status.value)
    } else if (status.kind === 'jsx-inline' || status.kind === 'system-construct') {
      // Not inlinable AND not unsafe — they have their own routing.
    } else {
      unsafeLocalNames.add(name)
    }
  }
  for (const [name, status] of analysis.functions) {
    if (status.kind === 'references-component-scope') unsafeLocalNames.add(name)
  }

  const freeIdsMap = new Map<string, Set<string>>()
  for (const c of ctx.localConstants) {
    if (c.freeIdentifiers) freeIdsMap.set(c.name, c.freeIdentifiers)
  }
  resolveChained(inlinableConstants, freeIdsMap)

  // Demote constants whose value still references an unsafe name.
  const toRemove: string[] = []
  for (const [constName, constValue] of inlinableConstants) {
    const constFreeIds = freeIdsMap.get(constName)
    let isUnsafe = false
    if (constFreeIds) {
      for (const unsafeName of unsafeLocalNames) {
        if (constFreeIds.has(unsafeName)) { isUnsafe = true; break }
      }
    }
    if (!isUnsafe) {
      // Post-chain: check the resolved string for any unsafe name.
      for (const unsafeName of unsafeLocalNames) {
        if (exprReferencesIdent(constValue, unsafeName)) {
          isUnsafe = true
          break
        }
      }
    }
    if (isUnsafe) {
      toRemove.push(constName)
      analysis.constants.set(constName, { kind: 'depends-on-unsafe' })
    }
  }
  for (const name of toRemove) {
    inlinableConstants.delete(name)
    unsafeLocalNames.add(name)
  }

  return { inlinableConstants, unsafeLocalNames }
}
