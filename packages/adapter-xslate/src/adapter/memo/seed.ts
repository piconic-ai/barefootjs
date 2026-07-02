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
  type ParsedExpr,
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
    // Request-scoped env signal (`createSearchParams()`, #1922): the runtime
    // seeds the canonical `$searchParams` reader per request, and the
    // expression lowering canonicalises any local alias (`const [sp] = …` →
    // `$searchParams.get(...)`). Mark the canonical name available so a
    // derived memo over the env signal seeds in-template (#2069); there is
    // nothing to seed for the signal itself.
    if (signal.envReader) {
      available.add(signal.getter)
      available.add('searchParams')
      continue
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
 * references an out-of-scope binding. (#1297)
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
  // The lowered Kolon for a higher-order body binds its own locals: callback
  // params (`(p) => …` → `-> $p { … }` lambda params). Those are
  // lowering-internal bindings, not template vars — allow them so a
  // filter/sort memo body over in-scope vars still seeds (#2069). `_` covers
  // any Perl-side topic var a helper's inline form may use.
  const allowed = new Set(available)
  allowed.add('_')
  // `$bf` is the runtime helper object, passed to every render — a lowering
  // that calls a runtime helper (`$bf.filter(...)`) is not referencing an
  // out-of-scope template binding.
  allowed.add('bf')
  for (const p of collectArrowParams(parsed)) allowed.add(p)
  return referencedVarsAreAvailable(kolon, allowed) ? kolon : null
}

/** Collect every arrow-callback param name in the parsed expression tree. */
export function collectArrowParams(expr: ParsedExpr): Set<string> {
  const out = new Set<string>()
  const visit = (e: ParsedExpr): void => {
    switch (e.kind) {
      case 'arrow':
        for (const p of e.params) out.add(p)
        visit(e.body)
        return
      case 'call':
        visit(e.callee)
        e.args.forEach(visit)
        return
      case 'binary':
      case 'logical':
        visit(e.left)
        visit(e.right)
        return
      case 'unary':
        visit(e.argument)
        return
      case 'conditional':
        visit(e.test)
        visit(e.consequent)
        visit(e.alternate)
        return
      case 'member':
        visit(e.object)
        return
      case 'index-access':
        visit(e.object)
        visit(e.index)
        return
      case 'template-literal':
        for (const p of e.parts) if (p.type === 'expression') visit(p.expr)
        return
      case 'array-literal':
        e.elements.forEach(visit)
        return
      case 'array-method':
        visit(e.object)
        e.args.forEach(visit)
        return
      case 'object-literal':
        for (const p of e.properties) visit(p.value)
        return
      default:
        return
    }
  }
  visit(expr)
  return out
}
