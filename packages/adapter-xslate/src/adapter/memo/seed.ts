/**
 * In-template memo / context seeding for the Text::Xslate template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `XslateMemoContext` (the adapter passes
 * `this`) so the cluster depends only on the recursive expression entry, not
 * the whole adapter class. These emit the `: my $x = ...;` line-statements
 * that let the body's bare `$x` resolve to a derived signal/memo value or an
 * active context value at SSR time. Mirror of the Go / Mojo adapter's `memo/*`.
 */

import {
  type ComponentIR,
  type ContextConsumer,
  collectContextConsumers,
  extractArrowBodyExpression,
  isSupported,
  parseExpression,
} from '@barefootjs/jsx'

import type { XslateMemoContext } from '../emit-context.ts'
import { referencedVarsAreAvailable } from '../lib/ir-scope.ts'

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
 * Seed memos whose SSR default is `null` (not statically evaluable) by
 * computing them in-template from the already-seeded prop / signal vars
 * (`createMemo(() => props.value * 10)` → `: my $x = $value * 10;`). Without
 * this the memo's `$x` renders empty — the reason
 * `props-reactivity-comparison` was skipped. Only emitted when every var the
 * lowering references is already in scope. (#1297)
 */
export function generateDerivedMemoSeed(ctx: XslateMemoContext, ir: ComponentIR): string {
  const memos = ir.metadata.memos ?? []
  const signals = ir.metadata.signals ?? []
  if (memos.length === 0 && signals.length === 0) return ''
  // Props seed first; each signal/memo adds its own name as it lands.
  const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
  const lines: string[] = []

  // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
  // a loop-child render gets no stash seed, so its `$on` would render nil;
  // and the static default can't capture the per-call prop. Seed it
  // in-template when the init lowers cleanly AND references an in-scope var.
  // Object/array/constant inits keep the existing ssr-defaults seeding.
  for (const signal of signals) {
    const kolon = tryLowerToKolon(ctx, signal.initialValue, available)
    // Kolon can't express `: my $x = … $x …` — declaring `my $x` makes the
    // RHS `$x` an undefined lexical rather than the render var. A same-name
    // signal (`createSignal(props.x ?? d)`, getter == prop) is just the prop
    // with a default, which the harness already seeds correctly from the
    // passed prop — skip the in-template seed for it. (Different-name
    // prop-derived signals like toggle's `on` from `defaultOn` are unaffected.)
    const refsSelf = kolon !== null && new RegExp(`\\$${signal.getter}\\b`).test(kolon)
    if (kolon !== null && !refsSelf) lines.push(`: my $${signal.getter} = ${kolon};`)
    available.add(signal.getter)
  }

  for (const memo of memos) {
    // Seed every memo whose body lowers cleanly — not just the ones whose
    // static SSR default is null. A statically-foldable prop-derived memo
    // (`createMemo(() => props.disabled ?? false)` → default `false`)
    // still depends on the per-call prop: the static stash seed bakes in
    // the absent-prop fold, so a caller passing `disabled => 1` would
    // render the default branch (#1897, select's disabled item). The
    // in-template recomputation reads the prop lexical already in scope;
    // block-bodied arrows / out-of-scope references fall back to the
    // static ssr-defaults seed. Same self-reference guard as the signal
    // loop above — Kolon's `my` shadows the render var on the RHS.
    const body = extractArrowBodyExpression(memo.computation)
    if (body !== null) {
      const kolon = tryLowerToKolon(ctx, body, available)
      const refsSelf = kolon !== null && new RegExp(`\\$${memo.name}\\b`).test(kolon)
      if (kolon !== null && !refsSelf) lines.push(`: my $${memo.name} = ${kolon};`)
    }
    available.add(memo.name)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/**
 * Lower a signal init / memo body to Kolon for an in-template SSR seed, or
 * `null` when it shouldn't be seeded this way: not a supported shape
 * (`isSupported` pre-check, so object/array literals don't fail the build),
 * references no in-scope var (a constant — keep ssr-defaults seeding), or
 * references an out-of-scope binding. (#1297)
 */
export function tryLowerToKolon(
  ctx: XslateMemoContext,
  expr: string,
  available: ReadonlySet<string>,
): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  if (!isSupported(parseExpression(trimmed)).supported) return null
  const kolon = ctx.convertExpressionToKolon(trimmed)
  if (kolon === '' || !/\$[A-Za-z_]\w*/.test(kolon)) return null
  return referencedVarsAreAvailable(kolon, available) ? kolon : null
}
