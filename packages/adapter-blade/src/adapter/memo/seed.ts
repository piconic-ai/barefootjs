/**
 * In-template memo / context seeding for the Blade template adapter.
 *
 * Ported from `packages/adapter-twig/src/adapter/memo/seed.ts`. Free
 * functions taking a `BladeMemoContext` (built by the adapter's `memoCtx`
 * getter) so the cluster depends only on the recursive expression entry, not
 * the whole adapter class. These emit the `@php($x = ...)` statements that
 * let the body's bare `$x` resolve to a derived signal/memo value or an
 * active context value at SSR time.
 *
 * One deliberate behavioural IMPROVEMENT over the Kolon port, carried
 * through from the Twig/Jinja ports unchanged: Kolon's `my` declares a NEW
 * lexical, so `: my $x = … $x …;` reads the not-yet-assigned lexical on its
 * own right-hand side — broken. Blade's `@php($x = ...)` compiles to a
 * plain PHP assignment statement — PHP has function-level (not block-level)
 * scope, and the view-rendering method already `extract()`ed the incoming
 * template vars into real PHP variables before this statement runs, so
 * `@php($x = $x + 1)` simply reads-then-reassigns the SAME `$x` — no
 * shadowing hazard (verified empirically:
 * `$factory->make('t', ['x' => 5])->render()` over a template whose body is
 * `@php($x = $x + 1)\n{{ $x }}` → `"6"`, not an error or a stale `5` — same
 * behaviour Twig/Jinja exhibit). This adapter therefore seeds a same-name
 * signal/memo too, which is strictly more correct — the seed then
 * re-derives from the already-bound prop instead of leaving the render var
 * on its static (possibly per-callsite-wrong) default. No self-ref guard is
 * ported for this reason (same as the Twig port's divergence 8).
 */

import {
  type ComponentIR,
  type ContextConsumer,
  collectContextConsumers,
  computeSsrSeedPlan,
  materializeGetterCalls,
} from '@barefootjs/jsx'

import type { BladeMemoContext } from '../emit-context.ts'
import { extractTopLevelIdentifiers } from '../lib/ir-scope.ts'
import { bladeVar, escapeBladeSingleQuoted } from '../lib/blade-naming.ts'

/** Blade/PHP literal for a context-consumer's `createContext` default. */
export function contextDefaultBlade(c: ContextConsumer): string {
  const d = c.defaultValue
  if (d === null || d === undefined) return 'null'
  if (typeof d === 'string') return `'${escapeBladeSingleQuoted(d)}'`
  if (typeof d === 'boolean') return d ? 'true' : 'false'
  return String(d)
}

/**
 * Emit one `@php($local = $bf->use_context(...))` statement per context
 * consumer so the body's bare `$local` resolves to the active provider
 * value (or the `createContext` default). (#1297)
 */
export function generateContextConsumerSeed(ir: ComponentIR): string {
  const consumers = collectContextConsumers(ir.metadata)
  if (consumers.length === 0) return ''
  return (
    consumers
      .map(
        c =>
          `@php(${bladeVar(c.localName)} = $bf->use_context('${c.contextName}', ${contextDefaultBlade(c)}))`,
      )
      .join('\n') + '\n'
  )
}

/**
 * Emit `@php($name = <blade>)` statements for every `derived` step of the
 * backend-neutral SSR seed plan — the scope/availability/ordering analysis
 * lives in `computeSsrSeedPlan` (packages/jsx/src/ssr-seed-plan.ts); this
 * only lowers each step's expression to Blade and applies the
 * backend-specific emit guards: skip an empty lowering, and skip a lowering
 * that references no top-level identifier at all (a constant init/body —
 * e.g. a `derived` step with empty `frees` — keeps the existing static
 * ssr-defaults seed instead). Unlike the Kolon port there is no self-ref
 * guard — see the file header. `env-reader` and `opaque` steps emit nothing
 * (the runtime supplies the reader, or the adapter's ssr-defaults path
 * already covers it). (#1297, #2075)
 *
 * `convertExpressionToBlade` can still fail DEEPER than the plan's
 * structural `isSupported` pre-check — e.g. a `.filter(predicate)` whose
 * predicate isn't evaluator-serializable has NO lambda fallback on this
 * adapter (`expr/emitters.ts`'s file header, divergence 9: unlike Kolon/Perl,
 * Blade has no lambda-expression form), so the lowering records a HARD
 * BF101 as a side effect rather than degrading. That's correct for every
 * OTHER `convertExpressionToBlade` call site (which commit to using the
 * lowered text), but wrong here: this is a SPECULATIVE "recompute the memo
 * in-template, else keep the static ssrDefault seed" attempt, so a deeper
 * refusal must degrade silently, not fail the whole component compile.
 * Snapshot the diagnostic list and roll back any errors appended during each
 * step's attempt before moving on.
 *
 * A second, related divergence opens up: a predicate referencing a SIBLING
 * getter (`props.items.filter((p) => !tag() || …)`, `tag` a sibling memo)
 * contains a zero-arg CALL node (`tag()`), which the evaluator's pure-
 * expression surface refuses (`toEvalNode`'s `call` arm only allows a
 * builtin callee, e.g. `Math.floor`) — with no lambda fallback to fall back
 * to, the whole predicate would refuse. Kolon/Perl never hit this: their
 * lambda form closes over the sibling's ALREADY-SEEDED lexical directly,
 * without going through the evaluator at all. Go hits the identical gap (it
 * also has no closures at SSR-constructor time) and fixes it the same way
 * its `memo/memo-compute.ts` (`matchFilterArmMemo`) does:
 * `materializeGetterCalls` rewrites a getter call into a bare identifier
 * BEFORE serialization, so the evaluator captures it as a free-var read from
 * `base_env` instead of an unsupported call node — and that free var then
 * resolves against the sibling's own `@php($x = ...)` line, which (being an
 * EARLIER step per the plan's ordering guarantee) is always already bound.
 * `env-reader` names are excluded from the materializable set — the runtime
 * supplies those via the per-request reader, not a template-var lexical, so
 * a call to one (`searchParams()`) must stay a real call, not a bare var.
 */
export function generateDerivedMemoSeed(ctx: BladeMemoContext, ir: ComponentIR): string {
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
    const blade = ctx.convertExpressionToBlade('', materialized)
    if (ctx.errors.length > errorsBefore) {
      ctx.errors.length = errorsBefore
      continue
    }
    if (blade === '' || extractTopLevelIdentifiers(blade).length === 0) continue
    lines.push(`@php(${bladeVar(step.name)} = ${blade})`)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}
