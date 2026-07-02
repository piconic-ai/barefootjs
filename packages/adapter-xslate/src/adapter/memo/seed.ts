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
  collectModuleStringConsts,
  envSignalReaderFor,
  extractArrowBodyExpression,
  freeIdentifiers,
  isSupported,
  parseExpression,
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
  // Props seed first; each signal/memo adds its own name as it lands. A
  // props-object component (`function C(props: {...})`, no destructure)
  // reads fields off `props.<x>` rather than a destructured local, so
  // `props` itself must be available for a memo body like
  // `props.items.filter(...)` to seed. A module-scope string const (`const
  // stateClasses = isDisabled() ? aCls : bCls`, select-item's
  // disabled/default class pair) is a free identifier in the SOURCE tree
  // but the lowering folds it to its literal string — never a `$var`
  // reference — so it must count as available too, or the scope guard
  // would wrongly reject an otherwise-seedable memo.
  const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
  if (ir.metadata.propsObjectName) available.add(ir.metadata.propsObjectName)
  for (const name of collectModuleStringConsts(ir.metadata.localConstants).keys()) {
    available.add(name)
  }
  const lines: string[] = []

  // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
  // a loop-child render gets no stash seed, so its `$on` would render nil;
  // and the static default can't capture the per-call prop. Seed it
  // in-template when the init lowers cleanly AND references an in-scope var.
  // Object/array/constant inits keep the existing ssr-defaults seeding.
  for (const signal of signals) {
    // Env signal (`createSearchParams()`, #1922): the runtime provides the
    // per-request reader, so there is nothing to seed. Registered readers
    // come from the shared registry (see `envSignalReaderFor`); an
    // `envReader` key unknown to the registry falls through to the normal
    // lowering below.
    if (signal.envReader) {
      const reader = envSignalReaderFor(signal.envReader)
      if (reader) {
        // Only the SOURCE getter name matters for the `freeIdentifiers`
        // scope check below (it walks the parsed JS tree, not the lowered
        // Kolon) — the canonical reader name the lowering emits is a
        // target-language detail, not a source identifier a memo body
        // could reference.
        available.add(signal.getter)
        continue
      }
    }
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
 * the SOURCE expression has a free identifier outside `available` (an
 * out-of-scope binding). The scope check runs over the parsed SOURCE tree
 * via `freeIdentifiers` — not the lowered Kolon string — so a shadowed name
 * (`filter((p) => p.ok) && p`, where the outer `p` is a different, unbound
 * reference from the callback's own `p` param) is correctly rejected instead
 * of the callback param masking the unrelated free `$p` in the emitted
 * Kolon. An unanalyzable expression (`freeIdentifiers` → null) fails safe:
 * no seed. (#1297)
 */
export function tryLowerToKolon(
  ctx: XslateMemoContext,
  expr: string,
  available: ReadonlySet<string>,
): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  const parsed = parseExpression(trimmed)
  if (!isSupported(parsed).supported) return null
  const kolon = ctx.convertExpressionToKolon(trimmed)
  if (kolon === '' || !/\$[A-Za-z_]\w*/.test(kolon)) return null
  const frees = freeIdentifiers(parsed)
  if (frees === null) return null
  for (const name of frees) if (!available.has(name)) return null
  return kolon
}
