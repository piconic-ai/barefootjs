/**
 * In-template memo / context seeding for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `memo/seed.ts` (issue #2018 track D
 * lineage). Free functions taking an `ErbMemoContext` (built by the
 * adapter's `memoCtx` getter) so the cluster depends only on the recursive
 * expression entry, not the whole adapter class. These emit `<% v[:x] =
 * ...; %>` seed lines that let the template body's `v[:x]` resolve to a
 * derived signal/memo value or an active context value at SSR time. Mirror
 * of the Go adapter's `memo/*`, retargeted to the vars-Hash variable model.
 */

import {
  type ComponentIR,
  type ContextConsumer,
  collectContextConsumers,
  computeSsrSeedPlan,
} from '@barefootjs/jsx'

import type { ErbMemoContext } from '../emit-context.ts'
import { rubyStringLiteral } from '../lib/ruby-naming.ts'

/** Ruby literal for a context-consumer's `createContext` default. */
export function contextDefaultRuby(c: ContextConsumer): string {
  const d = c.defaultValue
  if (d === null || d === undefined) return 'nil'
  if (typeof d === 'string') return rubyStringLiteral(d)
  if (typeof d === 'boolean') return d ? 'true' : 'false'
  return String(d)
}

/**
 * Emit one `<% v[:<local>] = bf.use_context(...) %>` seed line per context
 * consumer so the template body's `v[:<local>]` resolves to the active
 * provider value (or the `createContext` default).
 */
export function generateContextConsumerSeed(ir: ComponentIR): string {
  const consumers = collectContextConsumers(ir.metadata)
  if (consumers.length === 0) return ''
  return (
    consumers
      .map(
        c =>
          `<% v[:${c.localName}] = bf.use_context('${c.contextName}', ${contextDefaultRuby(c)}) %>`,
      )
      .join('\n') + '\n'
  )
}

/**
 * Emit `<% v[:<name>] = <ruby> %>` seed lines for every `derived` step of
 * the backend-neutral SSR seed plan — the scope/availability/ordering
 * analysis lives in `computeSsrSeedPlan` (packages/jsx/src/ssr-seed-plan.ts);
 * this only lowers each step's expression to Ruby and applies the two
 * backend-specific emit guards: skip an empty lowering, and skip a lowering
 * that references no `v[:var]` at all (a constant init/body — e.g. a
 * `derived` step with empty `frees` — keeps the existing static ssr-defaults
 * seed instead). `env-reader` and `opaque` steps emit nothing (the runtime
 * supplies the reader, or the adapter's ssr-defaults path already covers
 * it). (#1297, #2075)
 */
export function generateDerivedMemoSeed(ctx: ErbMemoContext, ir: ComponentIR): string {
  // Package G attached this to metadata at compile time; the `??` fallback
  // only covers hand-built metadata in older tests that predate the attached
  // plan — same shared function, so there's no divergence from the compiler.
  const plan = ir.metadata.ssrSeedPlan ?? computeSsrSeedPlan(ir.metadata)
  const lines: string[] = []
  for (const step of plan.steps) {
    if (step.kind !== 'derived') continue
    const ruby = ctx.convertExpressionToRuby(step.expr, step.parsed)
    if (ruby === '' || !/v\[:[A-Za-z_]\w*\]/.test(ruby)) continue
    lines.push(`<% v[:${step.name}] = ${ruby} %>`)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}
