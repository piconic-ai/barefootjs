/**
 * In-template memo / context seeding for the Text::Xslate template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `XslateMemoContext` (built by the adapter's
 * `memoCtx` getter) so the cluster depends only on the recursive expression entry, not
 * the whole adapter class. These emit the `: my $x = ...;` line-statements
 * that let the body's bare `$x` resolve to a derived signal/memo value or an
 * active context value at SSR time. Mirror of the Go / Mojo adapter's `memo/*`.
 */

import {
  type ComponentIR,
  type ContextConsumer,
  collectContextConsumers,
  computeSsrSeedPlan,
} from '@barefootjs/jsx'

import type { XslateMemoContext } from '../emit-context.ts'

/** Kolon literal for a context-consumer's `createContext` default. */
export function contextDefaultKolon(c: ContextConsumer): string {
  const d = c.defaultValue
  if (d === null || d === undefined) return 'nil'
  if (typeof d === 'string') return `'${d.replace(/[\\']/g, m => `\\${m}`)}'`
  if (typeof d === 'boolean') return d ? '1' : '0'
  return String(d)
}

/**
 * Emit one `: my $<local> = $bf.use_context(...)` line-statement per
 * context consumer so the body's bare `$<local>` resolves to the active
 * provider value (or the `createContext` default). (#1297)
 */
export function generateContextConsumerSeed(ir: ComponentIR): string {
  const consumers = collectContextConsumers(ir.metadata)
  if (consumers.length === 0) return ''
  return (
    consumers
      .map(
        c =>
          `: my $${c.localName} = $bf.use_context('${c.contextName}', ${contextDefaultKolon(c)});`,
      )
      .join('\n') + '\n'
  )
}

/**
 * Emit `: my $<name> = <kolon>;` line-statements for every `derived` step of
 * the backend-neutral SSR seed plan — the scope/availability/ordering
 * analysis lives in `computeSsrSeedPlan` (packages/jsx/src/ssr-seed-plan.ts);
 * this only lowers each step's expression to Kolon and applies the
 * backend-specific emit guards: skip an empty lowering, skip a lowering that
 * references no `$var` at all (a constant init/body — e.g. a `derived` step
 * with empty `frees` — keeps the existing static ssr-defaults seed instead),
 * and skip a self-referencing lowering (Kolon's `my` shadows the RHS, so
 * `: my $x = … $x …` would read the just-declared undefined lexical rather
 * than the render var — the plan rules out SOURCE-level self-refs, but a
 * lowered canonical name could still collide, so this stays as the cheap
 * defense it always was). `env-reader` and `opaque` steps emit nothing (the
 * runtime supplies the reader, or the adapter's ssr-defaults path already
 * covers it). (#1297, #2075)
 */
export function generateDerivedMemoSeed(ctx: XslateMemoContext, ir: ComponentIR): string {
  // Package G attached this to metadata at compile time; the `??` fallback
  // only covers hand-built metadata in older tests that predate the attached
  // plan — same shared function, so there's no divergence from the compiler.
  const plan = ir.metadata.ssrSeedPlan ?? computeSsrSeedPlan(ir.metadata)
  const lines: string[] = []
  for (const step of plan.steps) {
    if (step.kind !== 'derived') continue
    const kolon = ctx.convertExpressionToKolon(step.expr, step.parsed)
    if (kolon === '' || !/\$[A-Za-z_]\w*/.test(kolon)) continue
    if (new RegExp(`\\$${step.name}\\b`).test(kolon)) continue
    lines.push(`: my $${step.name} = ${kolon};`)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}
