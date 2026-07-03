/**
 * In-template memo / context seeding for the minijinja template adapter.
 *
 * Near-verbatim port of `packages/adapter-jinja/src/adapter/memo/seed.ts`
 * (itself ported from `packages/adapter-xslate/src/adapter/memo/seed.ts`).
 * Free functions taking a `JinjaMemoContext` (built by the adapter's `memoCtx`
 * getter) so the cluster depends only on the recursive expression entry, not
 * the whole adapter class. These emit the `{% set x = ... %}` statements
 * that let the body's bare `x` resolve to a derived signal/memo value or an
 * active context value at SSR time.
 *
 * One deliberate behavioural IMPROVEMENT over the Kolon port: Kolon's `my`
 * declares a NEW lexical, so `: my $x = … $x …;` reads the not-yet-assigned
 * lexical on its own right-hand side — broken. Xslate therefore skips
 * in-template seeding for a same-name signal/memo (a `refsSelf` guard in its
 * `generateDerivedMemoSeed`). Jinja's `{% set %}` has no such shadowing
 * hazard — `{% set x = x + 1 %}` resolves the right-hand `x` against the
 * value ALREADY bound in the enclosing scope (verified empirically against
 * Python's Jinja 3.1: `env.from_string("{% set x = x + 1 %}{{ x }}").render(x=5)`
 * → `"6"`, not an error or a stale `5`; `{% set %}` inside `{% for %}` was
 * independently re-verified against minijinja 2.21 by the orchestrator
 * spike). This adapter therefore seeds a
 * same-name signal/memo too, which is strictly more correct — the seed then
 * re-derives from the already-bound prop instead of leaving the render var
 * on its static (possibly per-callsite-wrong) default. No self-ref guard is
 * ported for this reason.
 */

import {
  type ComponentIR,
  type ContextConsumer,
  collectContextConsumers,
  computeSsrSeedPlan,
  materializeGetterCalls,
} from '@barefootjs/jsx'

import type { JinjaMemoContext } from '../emit-context.ts'
import { extractTopLevelIdentifiers } from '../lib/ir-scope.ts'
import { minijinjaIdent, escapeMinijinjaSingleQuoted } from '../lib/minijinja-naming.ts'

/** Jinja literal for a context-consumer's `createContext` default. */
export function contextDefaultJinja(c: ContextConsumer): string {
  const d = c.defaultValue
  if (d === null || d === undefined) return 'none'
  if (typeof d === 'string') return `'${escapeMinijinjaSingleQuoted(d)}'`
  if (typeof d === 'boolean') return d ? 'true' : 'false'
  return String(d)
}

/**
 * Emit one `{% set <local> = bf.use_context(...) %}` statement per context
 * consumer so the body's bare `<local>` resolves to the active provider
 * value (or the `createContext` default). (#1297)
 */
export function generateContextConsumerSeed(ir: ComponentIR): string {
  const consumers = collectContextConsumers(ir.metadata)
  if (consumers.length === 0) return ''
  return (
    consumers
      .map(
        c =>
          `{% set ${minijinjaIdent(c.localName)} = bf.use_context('${c.contextName}', ${contextDefaultJinja(c)}) %}`,
      )
      .join('\n') + '\n'
  )
}

/**
 * Emit `{% set <name> = <jinja> %}` statements for every `derived` step of
 * the backend-neutral SSR seed plan — the scope/availability/ordering
 * analysis lives in `computeSsrSeedPlan` (packages/jsx/src/ssr-seed-plan.ts);
 * this only lowers each step's expression to Jinja and applies the
 * backend-specific emit guards: skip an empty lowering, and skip a lowering
 * that references no top-level identifier at all (a constant init/body —
 * e.g. a `derived` step with empty `frees` — keeps the existing static
 * ssr-defaults seed instead). Unlike the Kolon port there is no self-ref
 * guard — see the file header. `env-reader` and `opaque` steps emit nothing
 * (the runtime supplies the reader, or the adapter's ssr-defaults path
 * already covers it). (#1297, #2075)
 *
 * `convertExpressionToJinja` can still fail DEEPER than the plan's
 * structural `isSupported` pre-check — e.g. a `.filter(predicate)` whose
 * predicate isn't evaluator-serializable has NO lambda fallback on this
 * adapter (divergence 3, `minijinja-adapter.ts`'s file header: unlike Kolon/Perl,
 * Jinja has no lambda-expression form), so the lowering records a HARD
 * BF101 as a side effect rather than degrading. That's correct for every
 * OTHER `convertExpressionToJinja` call site (which commit to using the
 * lowered text), but wrong here: this is a SPECULATIVE "recompute the memo
 * in-template, else keep the static ssrDefault seed" attempt, so a deeper
 * refusal must degrade silently, not fail the whole component compile.
 * Snapshot the diagnostic list and roll back any errors appended during each
 * step's attempt before moving on.
 *
 * A second, related Jinja-only gap divergence 3 opens up: a predicate
 * referencing a SIBLING getter (`props.items.filter((p) => !tag() || …)`,
 * `tag` a sibling memo) contains a zero-arg CALL node (`tag()`), which the
 * evaluator's pure-expression surface refuses (`toEvalNode`'s `call` arm
 * only allows a builtin callee, e.g. `Math.floor`) — with no lambda
 * fallback to fall back to, the whole predicate would refuse. Kolon/Perl
 * never hit this: their lambda form closes over the sibling's ALREADY-SEEDED
 * lexical directly, without going through the evaluator at all. Go hits the
 * identical gap (it also has no closures at SSR-constructor time) and fixes
 * it the same way its `memo/memo-compute.ts` (`matchFilterArmMemo`) does:
 * `materializeGetterCalls` rewrites a getter call into a bare identifier
 * BEFORE serialization, so the evaluator captures it as a free-var read from
 * `base_env` instead of an unsupported call node — and that free var then
 * resolves against the sibling's own `{% set %}` line, which (being an
 * EARLIER step per the plan's ordering guarantee) is always already bound.
 * `env-reader` names are excluded from the materializable set — the runtime
 * supplies those via the per-request reader, not a template-var lexical, so
 * a call to one (`searchParams()`) must stay a real call, not a bare var.
 */
export function generateDerivedMemoSeed(ctx: JinjaMemoContext, ir: ComponentIR): string {
  // Package G attached this to metadata at compile time; the `??` fallback
  // only covers hand-built metadata in older tests that predate the attached
  // plan — same shared function, so there's no divergence from the compiler.
  const plan = ir.metadata.ssrSeedPlan ?? computeSsrSeedPlan(ir.metadata)
  const knownGetterNames = new Set<string>(
    plan.steps.filter(s => s.kind !== 'env-reader').map(s => s.name),
  )
  const lines: string[] = []
  for (const step of plan.steps) {
    if (step.kind !== 'derived') continue
    const materialized = materializeGetterCalls(step.parsed, knownGetterNames)
    const errorsBefore = ctx.errors.length
    const jinja = ctx.convertExpressionToJinja('', materialized)
    if (ctx.errors.length > errorsBefore) {
      ctx.errors.length = errorsBefore
      continue
    }
    if (jinja === '' || extractTopLevelIdentifiers(jinja).length === 0) continue
    lines.push(`{% set ${minijinjaIdent(step.name)} = ${jinja} %}`)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}
