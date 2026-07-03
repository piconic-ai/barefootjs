/**
 * Backend-neutral SSR seed plan — which signals/memos an adapter may seed
 * in-template at SSR time, and from what scope.
 *
 * Design principle: the IR/analyzer side ANALYZES and attaches structured
 * information; adapters only EMIT. The "is this binding derivable from names
 * already in template scope" decision used to live (triplicated) in the
 * template adapters' seed paths; this module computes it once, on the IR, so
 * every adapter consumes the same plan and only supplies its own syntax.
 *
 * Ordering / acyclicity guarantee: `steps` lists the component's signals
 * first, then its memos, each group in declaration order (matching
 * `IRMetadata.signals` / `IRMetadata.memos`). A binding's name only enters
 * the scope set AFTER its own step is decided, so a `derived` step's `frees`
 * can only name `baseScope` entries or EARLIER steps — self- and
 * forward-references are rejected by construction, and a consumer emitting
 * the steps top-to-bottom never reads an undeclared local.
 *
 * Module-scope pure-string consts count as in-scope (they are part of
 * `baseScope`) because every adapter compile-time-inlines them to their
 * literal value — `collectModuleStringConsts` is the shared source of that
 * set — so a reference to one is never a template-variable read.
 *
 * A `derived` step with EMPTY `frees` is a constant expression (e.g.
 * `createSignal('b')`): the plan still classifies it as derived because the
 * expression is fully analyzable; emit-side constant-skipping (adapters keep
 * their existing ssr-defaults seeding for such inits) is an adapter concern,
 * not a plan concern. Likewise the plan makes no backend-specific choices —
 * no target-variable checks, no self-shadowing rules, no per-backend shape
 * catalogs — those stay in the adapters.
 */

import { collectModuleStringConsts } from './augment-inherited-props.ts'
import { envSignalReaderFor, type EnvSignalReader } from './adapters/env-signal.ts'
import {
  extractArrowBodyExpression,
  freeIdentifiers,
  isSupported,
  parseExpression,
  type ParsedExpr,
} from './expression-parser.ts'
import type { IRMetadata } from './types.ts'

/**
 * One binding in component declaration order (signals first, then memos —
 * matching `IRMetadata` order and the adapters' iteration).
 *
 * - `env-reader`: an env signal whose `envReader` key resolves in the shared
 *   registry (`envSignalReaderFor`). The runtime provides the per-request
 *   reader, so there is nothing to seed; the name still enters scope so a
 *   later derived step may reference it. An `envReader` key UNKNOWN to the
 *   registry falls through to the normal derived/opaque rules instead.
 * - `derived`: the binding's value expression is a supported shape whose free
 *   identifiers are all in scope at this point (baseScope + earlier steps) —
 *   an adapter may seed it in-template by lowering `parsed`/`expr`.
 * - `opaque`: not seedable this way (empty init, unsupported shape,
 *   unanalyzable free set, out-of-scope reference, or a block-bodied memo).
 *   The name still enters scope for later steps; adapters keep their static
 *   ssr-defaults seeding for it.
 */
export type SsrSeedStep =
  | { kind: 'env-reader'; name: string; reader: EnvSignalReader }
  | { kind: 'derived'; name: string; origin: 'signal' | 'memo'; expr: string; parsed: ParsedExpr; frees: string[] }
  | { kind: 'opaque'; name: string; origin: 'signal' | 'memo' }

export interface SsrSeedPlan {
  /**
   * Names in scope before any step: props params, the props-object name
   * (when the component takes an undestructured props object), and module
   * pure-string consts (compile-time inlined by every adapter).
   */
  baseScope: string[]
  steps: SsrSeedStep[]
}

/**
 * Classify one value expression against the current scope: `derived` when it
 * parses to a supported shape whose free identifiers are all `available`
 * (an unanalyzable free set — `freeIdentifiers` → null — fails safe to
 * opaque). The scope check runs over the parsed SOURCE tree, so a shadowed
 * name (`items.filter((p) => p.ok) && p`, where the trailing `p` is a
 * different, unbound reference from the callback's own param) is rejected.
 */
function classify(
  name: string,
  origin: 'signal' | 'memo',
  expr: string,
  parsed: ParsedExpr,
  available: ReadonlySet<string>,
): SsrSeedStep {
  if (!isSupported(parsed).supported) return { kind: 'opaque', name, origin }
  const frees = freeIdentifiers(parsed)
  if (frees === null) return { kind: 'opaque', name, origin }
  for (const free of frees) {
    if (!available.has(free)) return { kind: 'opaque', name, origin }
  }
  return { kind: 'derived', name, origin, expr, parsed, frees: [...frees] }
}

/**
 * Compute the component's SSR seed plan from its metadata. See the module
 * doc for the contract. Memo steps are gated to EXPRESSION-BODIED memos
 * (`extractArrowBodyExpression` returns the body): a block-bodied memo is
 * `opaque` even when the analyzer folded it to a `parsed` expression.
 */
export function computeSsrSeedPlan(metadata: IRMetadata): SsrSeedPlan {
  const baseScope: string[] = metadata.propsParams.map(p => p.name)
  if (metadata.propsObjectName) baseScope.push(metadata.propsObjectName)
  for (const name of collectModuleStringConsts(metadata.localConstants).keys()) {
    baseScope.push(name)
  }

  const available = new Set<string>(baseScope)
  const steps: SsrSeedStep[] = []

  for (const signal of metadata.signals) {
    if (signal.envReader) {
      const reader = envSignalReaderFor(signal.envReader)
      if (reader) {
        steps.push({ kind: 'env-reader', name: signal.getter, reader })
        available.add(signal.getter)
        continue
      }
    }
    const expr = signal.initialValue.trim()
    steps.push(
      expr === ''
        ? { kind: 'opaque', name: signal.getter, origin: 'signal' }
        : classify(signal.getter, 'signal', expr, parseExpression(expr), available),
    )
    available.add(signal.getter)
  }

  for (const memo of metadata.memos) {
    const body = extractArrowBodyExpression(memo.computation)
    const expr = body?.trim() ?? ''
    steps.push(
      expr === ''
        ? { kind: 'opaque', name: memo.name, origin: 'memo' }
        : classify(memo.name, 'memo', expr, memo.parsed ?? parseExpression(expr), available),
    )
    available.add(memo.name)
  }

  return { baseScope, steps }
}
