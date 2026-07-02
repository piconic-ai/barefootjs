/**
 * In-template memo / context seeding for the Jinja template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/memo/seed.ts`. Free
 * functions taking a `JinjaMemoContext` (built by the adapter's `memoCtx`
 * getter) so the cluster depends only on the recursive expression entry, not
 * the whole adapter class. These emit the `{% set x = ... %}` statements
 * that let the body's bare `x` resolve to a derived signal/memo value or an
 * active context value at SSR time.
 *
 * One deliberate behavioural IMPROVEMENT over the Kolon port: Kolon's `my`
 * declares a NEW lexical, so `: my $x = … $x …;` reads the not-yet-assigned
 * lexical on its own right-hand side — broken. Xslate therefore skips
 * in-template seeding for a same-name signal/memo (`refsSelf` guard).
 * Jinja's `{% set %}` has no such shadowing hazard — `{% set x = x + 1 %}`
 * resolves the right-hand `x` against the value ALREADY bound in the
 * enclosing scope (verified empirically against Jinja 3.1: `env.from_string
 * ("{% set x = x + 1 %}{{ x }}").render(x=5)` → `"6"`, not an error or a
 * stale `5`). This adapter therefore seeds a same-name signal/memo too,
 * which is strictly more correct — the seed then re-derives from the
 * already-bound prop instead of leaving the render var on its static
 * (possibly per-callsite-wrong) default.
 */

import {
  type ComponentIR,
  type ContextConsumer,
  collectContextConsumers,
  extractArrowBodyExpression,
  isSupported,
  parseExpression,
} from '@barefootjs/jsx'

import type { JinjaMemoContext } from '../emit-context.ts'
import { extractTopLevelIdentifiers, referencedVarsAreAvailable } from '../lib/ir-scope.ts'
import { jinjaIdent, escapeJinjaSingleQuoted } from '../lib/jinja-naming.ts'

/** Jinja literal for a context-consumer's `createContext` default. */
export function contextDefaultJinja(c: ContextConsumer): string {
  const d = c.defaultValue
  if (d === null || d === undefined) return 'none'
  if (typeof d === 'string') return `'${escapeJinjaSingleQuoted(d)}'`
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
          `{% set ${jinjaIdent(c.localName)} = bf.use_context('${c.contextName}', ${contextDefaultJinja(c)}) %}`,
      )
      .join('\n') + '\n'
  )
}

/**
 * Seed memos whose SSR default is `null` (not statically evaluable) by
 * computing them in-template from the already-seeded prop / signal vars
 * (`createMemo(() => props.value * 10)` → `{% set x = value * 10 %}`).
 * Without this the memo's `x` renders empty — the reason
 * `props-reactivity-comparison` was skipped on the Perl adapters. Only
 * emitted when every var the lowering references is already in scope.
 * (#1297)
 */
export function generateDerivedMemoSeed(ctx: JinjaMemoContext, ir: ComponentIR): string {
  const memos = ir.metadata.memos ?? []
  const signals = ir.metadata.signals ?? []
  if (memos.length === 0 && signals.length === 0) return ''
  // Props seed first; each signal/memo adds its own name as it lands.
  const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
  const lines: string[] = []

  // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
  // a loop-child render gets no context seed, so its `on` would resolve
  // Undefined; and the static default can't capture the per-call prop. Seed
  // it in-template when the init lowers cleanly AND references an in-scope
  // var. Object/array/constant inits keep the existing ssr-defaults seeding.
  for (const signal of signals) {
    const jinja = tryLowerToJinja(ctx, signal.initialValue, available)
    if (jinja !== null) lines.push(`{% set ${jinjaIdent(signal.getter)} = ${jinja} %}`)
    available.add(signal.getter)
  }

  for (const memo of memos) {
    // Seed every memo whose body lowers cleanly — not just the ones whose
    // static SSR default is null. A statically-foldable prop-derived memo
    // (`createMemo(() => props.disabled ?? false)` → default `false`) still
    // depends on the per-call prop: the static context seed bakes in the
    // absent-prop fold, so a caller passing `disabled=True` would render
    // the default branch (#1897, select's disabled item). The in-template
    // recomputation reads the prop already in scope; block-bodied arrows /
    // out-of-scope references fall back to the static ssr-defaults seed.
    const body = extractArrowBodyExpression(memo.computation)
    if (body !== null) {
      const jinja = tryLowerToJinja(ctx, body, available)
      if (jinja !== null) lines.push(`{% set ${jinjaIdent(memo.name)} = ${jinja} %}`)
    }
    available.add(memo.name)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/**
 * Lower a signal init / memo body to Jinja for an in-template SSR seed, or
 * `null` when it shouldn't be seeded this way: not a supported shape
 * (`isSupported` pre-check, so object/array literals don't fail the build),
 * references no in-scope var (a constant — keep ssr-defaults seeding), or
 * references an out-of-scope binding. (#1297)
 */
export function tryLowerToJinja(
  ctx: JinjaMemoContext,
  expr: string,
  available: ReadonlySet<string>,
): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  if (!isSupported(parseExpression(trimmed)).supported) return null
  // `isSupported` is a shallow structural check (is this a JS shape the
  // compiler recognizes at all — binary/logical/call/etc.), NOT a guarantee
  // that the deeper Jinja evaluator-JSON serialization inside a nested
  // `.filter`/`.find`/... predicate can actually represent this specific
  // callback body (e.g. a predicate with chained method calls like
  // `row => row.email.toLowerCase().includes(x)`). When it can't,
  // `convertExpressionToJinja` records a HARD `BF101` compile error as a
  // side effect (`_recordExprBF101`) — correct for every OTHER call site,
  // which commits to using the lowered text, but wrong here: this helper is
  // a SPECULATIVE "try the in-template recomputation, else keep the static
  // ssrDefault seed" probe, so a refusal must degrade silently, not fail the
  // whole component compile. Snapshot the diagnostic list and roll back any
  // errors appended during this attempt before returning null.
  const errorsBefore = ctx.errors.length
  const jinja = ctx.convertExpressionToJinja(trimmed)
  if (ctx.errors.length > errorsBefore) {
    ctx.errors.length = errorsBefore
    return null
  }
  if (jinja === '' || extractTopLevelIdentifiers(jinja).length === 0) return null
  return referencedVarsAreAvailable(jinja, available) ? jinja : null
}
