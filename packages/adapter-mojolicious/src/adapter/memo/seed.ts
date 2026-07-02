/**
 * In-template memo / context seeding for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Free functions taking a `MojoMemoContext` (built by the adapter's
 * `memoCtx` getter) so the cluster depends only on the recursive expression entry, not
 * the whole adapter class. These emit the `% my $x = ...;` seed lines that let
 * the template body's bare `$x` resolve to a derived signal/memo value or an
 * active context value at SSR time. Mirror of the Go adapter's `memo/*`.
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

import type { MojoMemoContext } from '../emit-context.ts'
import { referencedVarsAreAvailable } from '../lib/ir-scope.ts'

/** Perl literal for a context-consumer's `createContext` default. */
export function contextDefaultPerl(c: ContextConsumer): string {
  const d = c.defaultValue
  if (d === null || d === undefined) return 'undef'
  if (typeof d === 'string') return `'${d.replace(/[\\']/g, m => `\\${m}`)}'`
  if (typeof d === 'boolean') return d ? '1' : '0'
  return String(d)
}

/**
 * Emit one `% my $<local> = bf->use_context(...)` seed line per context
 * consumer so the template body's bare `$<local>` resolves to the active
 * provider value (or the `createContext` default). (#1297)
 */
export function generateContextConsumerSeed(ir: ComponentIR): string {
  const consumers = collectContextConsumers(ir.metadata)
  if (consumers.length === 0) return ''
  return (
    consumers
      .map(
        c =>
          `% my $${c.localName} = bf->use_context('${c.contextName}', ${contextDefaultPerl(c)});`,
      )
      .join('\n') + '\n'
  )
}

/**
 * Seed memos whose SSR default is `null` (not statically evaluable) by
 * computing them in-template from the already-seeded prop / signal vars.
 * Targets the prop-derived memo shape (`createMemo(() => props.value * 10)`)
 * that the static `extractSsrDefaults` evaluator can't fold — without this
 * the memo's `$x` renders empty (the reason `props-reactivity-comparison`
 * was skipped). Only emitted when the lowered expression references vars the
 * template already has in scope (props params + signals + prior memos), so a
 * memo over an out-of-scope binding stays on the null path rather than
 * tripping Perl strict mode. (#1297)
 */
export function generateDerivedMemoSeed(ctx: MojoMemoContext, ir: ComponentIR): string {
  const memos = ir.metadata.memos ?? []
  const signals = ir.metadata.signals ?? []
  if (memos.length === 0 && signals.length === 0) return ''
  // Props seed first; each signal/memo adds its own name as it lands so a
  // later one can reference an earlier one.
  const available = new Set<string>(ir.metadata.propsParams.map(p => p.name))
  const lines: string[] = []

  // Prop/signal-derived signals (`createSignal(props.defaultOn ?? false)`):
  // a loop-child render receives no stash seed for the signal, so its `$on`
  // would trip strict mode; and even when an entry render seeds it, the
  // static default can't capture the per-call prop. Seed it in-template from
  // the passed prop — but ONLY when the init lowers cleanly AND references an
  // in-scope var (i.e. it's genuinely derived). Object/array/constant inits
  // (`createSignal({…})`, `createSignal([…])`, `createSignal('b')`) keep the
  // existing ssr-defaults seeding, so the spread / loop fixtures are
  // untouched.
  for (const signal of signals) {
    // Request-scoped env signal (`createSearchParams()`, #1922): the runtime
    // seeds the canonical `$searchParams` reader per request, and the
    // expression lowering canonicalises any local alias (`const [sp] = …` →
    // `$searchParams->get(...)`). Mark the canonical name available so a
    // derived memo over the env signal seeds in-template (#2069); there is
    // nothing to seed for the signal itself.
    if (signal.envReader) {
      available.add(signal.getter)
      available.add('searchParams')
      continue
    }
    const perl = tryLowerToPerl(ctx, signal.initialValue, available)
    if (perl !== null) lines.push(`% my $${signal.getter} = ${perl};`)
    available.add(signal.getter)
  }

  for (const memo of memos) {
    // Seed every memo whose body lowers cleanly — not just the ones whose
    // static SSR default is null. A statically-foldable prop-derived memo
    // (`createMemo(() => props.disabled ?? false)` → default `false`)
    // still depends on the per-call prop: the static stash seed bakes in
    // the absent-prop fold, so a caller passing `disabled => 1` would
    // render the default branch (#1897, select's disabled item). The
    // in-template recomputation reads the prop lexical the stash already
    // seeded, so it's correct per call; block-bodied arrows /
    // out-of-scope references fall back to the static ssr-defaults seed.
    const body = extractArrowBodyExpression(memo.computation)
    if (body !== null) {
      const perl = tryLowerToPerl(ctx, body, available)
      if (perl !== null) lines.push(`% my $${memo.name} = ${perl};`)
    }
    available.add(memo.name)
  }
  return lines.length > 0 ? lines.join('\n') + '\n' : ''
}

/**
 * Lower a signal init / memo body to Perl for an in-template SSR seed, or
 * `null` when it shouldn't be seeded this way. Returns null — without
 * recording a BF101 — when the expression isn't a supported shape
 * (`isSupported` pre-check, so object/array literals don't fail the build),
 * when the lowering references no in-scope var (a constant — keep the
 * existing ssr-defaults seeding), or when it references an out-of-scope
 * binding. (#1297)
 */
export function tryLowerToPerl(
  ctx: MojoMemoContext,
  expr: string,
  available: ReadonlySet<string>,
): string | null {
  const trimmed = expr.trim()
  if (!trimmed) return null
  const parsed = parseExpression(trimmed)
  if (!isSupported(parsed).supported) return null
  const perl = ctx.convertExpressionToPerl(trimmed)
  if (perl === '' || !/\$[A-Za-z_]\w*/.test(perl)) return null
  // The lowered Perl for a higher-order body binds its own locals: callback
  // params (`(p) => …` → `$p` in a coderef, or the `$_` topic in an inline
  // `grep`). Those are lowering-internal bindings, not template vars — allow
  // them so a filter/sort memo body over in-scope vars still seeds (#2069).
  const allowed = new Set(available)
  allowed.add('_')
  for (const p of collectArrowParams(parsed)) allowed.add(p)
  return referencedVarsAreAvailable(perl, allowed) ? perl : null
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
