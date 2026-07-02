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
  extractArrowBodyExpression,
  isSupported,
  parseExpression,
} from '@barefootjs/jsx'

import type { ErbMemoContext } from '../emit-context.ts'
import { referencedVarsAreAvailable } from '../lib/ir-scope.ts'
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
 * Seed memos whose SSR default is `nil` (not statically evaluable) by
 * computing them in-template from the already-seeded prop / signal vars.
 * Targets the prop-derived memo shape (`createMemo(() => props.value * 10)`)
 * that the static `extractSsrDefaults` evaluator can't fold — without this
 * the memo's `v[:x]` renders empty. Only emitted when the lowered
 * expression references vars-Hash keys the template already has seeded
 * (props params + signals + prior memos), so a memo over an out-of-scope
 * binding stays on the nil path rather than reading an un-seeded key.
 */
export function generateDerivedMemoSeed(ctx: ErbMemoContext, ir: ComponentIR): string {
  const memos = ir.metadata.memos ?? []
  const signals = ir.metadata.signals ?? []
  if (memos.length === 0 && signals.length === 0) return ''
  // Props seed first; each signal/memo adds its own name as it lands so a
  // later one can reference an earlier one.
  const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
  const lines: string[] = []

  // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
  // a loop-child render receives no vars-Hash seed for the signal, so its
  // `v[:on]` would read nil; and even when an entry render seeds it, the
  // static default can't capture the per-call prop. Seed it in-template
  // from the passed prop — but ONLY when the init lowers cleanly AND
  // references an in-scope var (i.e. it's genuinely derived). Object/array/
  // constant inits (`createSignal({…})`, `createSignal([…])`,
  // `createSignal('b')`) keep the existing ssr-defaults seeding, so the
  // spread / loop fixtures are untouched.
  for (const signal of signals) {
    const ruby = tryLowerToRuby(ctx, signal.initialValue, available)
    if (ruby !== null) lines.push(`<% v[:${signal.getter}] = ${ruby} %>`)
    available.add(signal.getter)
  }

  for (const memo of memos) {
    // Seed every memo whose body lowers cleanly — not just the ones whose
    // static SSR default is nil. A statically-foldable prop-derived memo
    // (`createMemo(() => props.disabled ?? false)` → default `false`)
    // still depends on the per-call prop: the static vars-Hash seed bakes
    // in the absent-prop fold, so a caller passing `disabled: true` would
    // render the default branch. The in-template recomputation reads the
    // prop lexical the vars Hash already seeded, so it's correct per call;
    // block-bodied arrows / out-of-scope references fall back to the
    // static ssr-defaults seed.
    const body = extractArrowBodyExpression(memo.computation)
    if (body !== null) {
      const ruby = tryLowerToRuby(ctx, body, available)
      if (ruby !== null) lines.push(`<% v[:${memo.name}] = ${ruby} %>`)
    }
    available.add(memo.name)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/**
 * Lower a signal init / memo body to Ruby for an in-template SSR seed, or
 * `null` when it shouldn't be seeded this way. Returns null — without
 * recording a BF101 — when the expression isn't a supported shape
 * (`isSupported` pre-check, so object/array literals don't fail the build),
 * when the lowering references no in-scope var (a constant — keep the
 * existing ssr-defaults seeding), or when it references an out-of-scope
 * binding.
 */
export function tryLowerToRuby(
  ctx: ErbMemoContext,
  expr: string,
  available: ReadonlySet<string>,
): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  if (!isSupported(parseExpression(trimmed)).supported) return null
  const ruby = ctx.convertExpressionToRuby(trimmed)
  if (ruby === '' || !/v\[:[A-Za-z_]\w*\]/.test(ruby)) return null
  return referencedVarsAreAvailable(ruby, available) ? ruby : null
}
