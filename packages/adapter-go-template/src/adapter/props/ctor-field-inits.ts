/**
 * The state-field initializers of the `New<Name>Props` constructor (#3425):
 * how each prop, signal and memo field of the returned `<Name>Props` literal
 * gets its constructor-time value, and the locals those values share.
 *
 * `generateNewPropsFunction` (the orchestrator in `go-template-adapter.ts`)
 * decides the order and emits the nested-rows, context, child-instance and
 * spread parts; the decisions about a prop's, signal's or memo's own seed
 * live here as free functions over a {@link GoEmitContext}, next to the
 * field typing in `type/state-fields.ts` they must agree with:
 *
 * - {@link emitPropFallbackLocals} — the hoisted `props.X ?? N` locals.
 * - {@link hoistSiblingMemoLocals} — memos an earlier filter-arm sibling
 *   reads, computed once into a local.
 * - {@link emitPropFieldInits} — each prop field, with its destructure
 *   default, a shared signal fallback or a shadowing memo's fallback folded in.
 * - {@link emitSignalFieldInits} — each signal field's seed.
 * - {@link emitMemoFieldInits} — each memo field's seed.
 */

import { isElidedFactoryGetter, type ComponentIR, type SourceLocation } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { resolveSignalParsedThroughSeedPlan } from '../lib/compile-state.ts'
import { applyGoFallback } from '../lib/go-emit.ts'
import { GO_KEYWORDS, capitalizeFieldName } from '../lib/go-naming.ts'
import { propsFieldName } from '../lib/props-field-names.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { computeMemoInitialValue, filterArmEarlierSiblingRefs, memoPropFallback } from '../memo/memo-compute.ts'
import { inferMemoType, sharedFieldFallbackVar, signalSeedGo } from '../type/state-fields.ts'
import { jsLiteralToGo } from '../value/value-lowering.ts'
import { defaultedBindingGo, resolvePropGoType } from './prop-types.ts'

/**
 * Signal-time prop fallbacks: `createSignal(props.X ?? N)` hoists `N` as a
 * local so the signal, any derived memo, and the prop field share one
 * fallback-applied value. Go zero values can't tell an explicit `Initial: 0`
 * from an omitted field, so it also fires on the type's zero value.
 */
export function emitPropFallbackLocals(
  lines: string[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): void {
  for (const [, info] of propFallbackVars) {
    if (info.assertType) {
      // Nillable-lowered prop (#2248): the `interface{}` field makes
      // "absent" (nil) distinguishable from an explicit `''`/`0`/`false`,
      // so the fallback applies ONLY on nil — JS `??` semantics. Numbers
      // coerce through the runtime (an untyped `Size: 3` literal boxes as
      // int even into a float64-shaped prop); string/bool assert directly.
      const deref =
        info.assertType === 'int' ? `bf.ToInt(in.${info.fieldName})`
        : info.assertType === 'float64' ? `bf.ToFloat64(in.${info.fieldName})`
        : `in.${info.fieldName}.(${info.assertType})`
      lines.push(`\tvar ${info.varName} ${info.assertType} = ${info.goFallback}`)
      lines.push(`\tif in.${info.fieldName} != nil {`)
      lines.push(`\t\t${info.varName} = ${deref}`)
      lines.push(`\t}`)
    } else {
      lines.push(`\t${info.varName} := in.${info.fieldName}`)
      lines.push(`\tif ${info.varName} == ${info.zeroLiteral} {`)
      lines.push(`\t\t${info.varName} = ${info.goFallback}`)
      lines.push(`\t}`)
    }
  }
  if (propFallbackVars.size > 0) lines.push('')
}

/**
 * Sibling-memo hoisting (#2075/#2077 review finding 3): a filter-arm memo
 * whose predicate free vars reference an EARLIER sibling memo would
 * otherwise recompute that sibling's whole expression a second time
 * inline in its `bf.FilterEval` env map, duplicating it against the
 * sibling's own field. Two-pass: first collect which memos are
 * referenced this way, then hoist each into a local emitted once before
 * the `return`; the memo-field loop ({@link emitMemoFieldInits}, and the
 * referencing memo's own env-map entry, via `ctx.state.hoistedMemoLocals`)
 * both reuse the local instead of re-emitting the expression. Declared
 * `var name Type = value` (not `:=`) because an unresolved computation can
 * fall back to the bare `nil` literal, which `:=` can't type-infer.
 */
export function hoistSiblingMemoLocals(
  ctx: GoEmitContext,
  lines: string[],
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): void {
  const memoPropsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
  const hoistNames = new Set<string>()
  for (const memo of ir.metadata.memos) {
    for (const name of filterArmEarlierSiblingRefs(ctx, memo, ir.metadata.signals, ir.metadata.propsParams)) {
      hoistNames.add(name)
    }
  }
  if (hoistNames.size === 0) return
  for (const memo of ir.metadata.memos) {
    if (!hoistNames.has(memo.name)) continue
    const goType = inferMemoType(ctx, memo, ir.metadata.signals, memoPropsParamMap)
    const value = computeMemoInitialValue(ctx, memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType)
    let localName = `memo${capitalizeFieldName(memo.name)}`
    while (GO_KEYWORDS.has(localName)) localName += '_'
    lines.push(`\tvar ${localName} ${goType} = ${value}`)
    ctx.state.hoistedMemoLocals.set(memo.name, localName)
  }
  lines.push('')
}

/**
 * A memo shadowing a same-named prop (`const className = createMemo(() =>
 * props.className ?? '')`) shares the prop's field, so its `?? fallback`
 * folds into the prop initializer. Keyed by that shared field name.
 */
function propShadowingMemoFallbacks(
  ctx: GoEmitContext,
  ir: ComponentIR,
  propTypeOverrides: Map<string, string>,
): Map<string, { goFallback: string; goType: string }> {
  const memoFallbacks = new Map<string, { goFallback: string; goType: string }>()
  for (const memo of ir.metadata.memos) {
    const m = memoPropFallback(ctx, memo)
    if (!m) continue
    if (capitalizeFieldName(m.propName) !== capitalizeFieldName(memo.name)) continue
    // `applyGoFallback` emits a string-typed zero check; only `string` /
    // `interface{}` fields take the fold (the latter via the nil-tolerant
    // wrapper in `emitPropFieldInits`), so restrict here.
    const param = ir.metadata.propsParams.find(
      p => propsFieldName(p, ir.metadata) === capitalizeFieldName(memo.name),
    )
    if (!param) continue
    const goType = resolvePropGoType(ctx, param, propTypeOverrides)
    if (goType !== 'string' && goType !== 'interface{}') continue
    memoFallbacks.set(capitalizeFieldName(memo.name), { goFallback: m.goFallback, goType })
  }
  return memoFallbacks
}

/**
 * Props params' fields of the returned literal. A JSX-declared default
 * (`variant = 'default'`) is baked in so a Go zero value can't shadow it, and
 * so is the signal-side fallback (`props.X ?? N`, via the hoisted var) of a
 * signal sharing the field (`sharedFieldFallbackVar`), and a shadowing memo's
 * fallback ({@link propShadowingMemoFallbacks}).
 *
 * Returns the field names emitted, so the signal and memo loops skip a name
 * already emitted as a prop field.
 */
export function emitPropFieldInits(
  ctx: GoEmitContext,
  lines: string[],
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  propTypeOverrides: Map<string, string>,
): Set<string> {
  const memoFallbacks = propShadowingMemoFallbacks(ctx, ir, propTypeOverrides)

  const propFieldNames = new Set<string>()
  for (const param of ir.metadata.propsParams) {
    // Props field: LOCAL binding, what the template reads (`{{.X}}`),
    // except where `propsFieldNames` moves it (the children prop, a
    // local named `children`).
    // Everything on the right of `:` below reads `in.<inputField>`
    // (caller-facing), never `in.<fieldName>` (local).
    const fieldName = propsFieldName(param, ir.metadata)
    const inputField = capitalizeFieldName(param.sourceName ?? param.name)
    const hoisted = sharedFieldFallbackVar(ir, param.name, propFallbackVars)
    if (hoisted) {
      // #2683: a `collisionWrap` entry means this field is ALSO a
      // colliding signal's shared field — `hoisted.varName` alone only
      // carries the coalesced `props.X ?? <lit>` value, so the surrounding
      // arithmetic (`* 2`, etc.) is composed back on here, giving the
      // FULLY DERIVED value the signal's own initializer computes. Without
      // this the field would silently carry just the coalesce result (the
      // same class of bug this fix addresses, one operator short).
      const value = hoisted.collisionWrap
        ? `${hoisted.varName} ${hoisted.collisionWrap.operator} ${hoisted.collisionWrap.operand}`
        : hoisted.varName
      lines.push(`\t\t${fieldName}: ${value},`)
    } else {
      const defaulted = defaultedBindingGo(ctx, param, ir.metadata.propsParams, propTypeOverrides)
      const memoFold = memoFallbacks.get(fieldName)
      if (defaulted !== null) {
        lines.push(`\t\t${fieldName}: ${defaulted},`)
      } else if (memoFold !== undefined && memoFold.goType === 'string') {
        lines.push(`\t\t${fieldName}: ${applyGoFallback(`in.${inputField}`, memoFold.goFallback)},`)
      } else if (memoFold !== undefined) {
        // interface{} field (`size ?? 'icon'`): the string zero-check doesn't
        // compile, so wrap in a nil/empty-tolerant IIFE.
        lines.push(
          `\t\t${fieldName}: func() interface{} { v := interface{}(in.${inputField}); if v == nil || v == "" { return ${memoFold.goFallback} }; return v }(),`,
        )
      } else {
        lines.push(`\t\t${fieldName}: in.${inputField},`)
      }
    }
    propFieldNames.add(fieldName)
  }
  return propFieldNames
}

/** Signal initial values (skip a name already emitted as a prop field). */
export function emitSignalFieldInits(
  ctx: GoEmitContext,
  lines: string[],
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  propFieldNames: ReadonlySet<string>,
): void {
  for (const signal of ir.metadata.signals) {
    // Env signals are the request-scoped `SearchParams` reader field, not a
    // stored value — no baked initial value to emit here (#2057).
    if (signal.envReader) continue
    // An elided async-factory value (#3245): no field was emitted for it in
    // `emitPropsDataFields`, so a ctor init here would set a nonexistent
    // field. See that loop's comment (and `isElidedFactoryGetter`'s
    // docstring) for the full rationale.
    if (isElidedFactoryGetter(signal)) continue
    const fieldName = capitalizeFieldName(signal.getter)
    if (propFieldNames.has(fieldName)) continue
    // Bake against the synthesised struct type if one was inferred for this
    // untyped object-array signal, else the signal's own type.
    const bakeType = ctx.state.synthStructTypes.get(signal.getter) ?? signal.type
    const initialValue = signalSeedGo(ctx, signal, ir.metadata.propsParams, propFallbackVars, bakeType, true)
    lines.push(`\t\t${fieldName}: ${initialValue},`)
    const resolvedParsed = resolveSignalParsedThroughSeedPlan(ctx.state, signal)
    if (resolvedParsed?.kind === 'object-literal' && jsLiteralToGo(ctx, bakeType, resolvedParsed) === null) {
      const step = ctx.state.ssrSeedPlan.steps.find(s => s.kind === 'derived' && s.origin === 'signal' && s.name === signal.getter)
      if (step?.kind === 'derived') refuseUnbakeableDerivedObjectLiteral(ctx, signal.getter, signal.loc, step.frees)
    }
  }
}

/**
 * Memo initial values (from signal initials). Prop-shadowing memos were
 * folded into the prop field ({@link emitPropFieldInits}); a memo
 * {@link hoistSiblingMemoLocals} already hoisted reuses that local instead of
 * recomputing its expression.
 */
export function emitMemoFieldInits(
  ctx: GoEmitContext,
  lines: string[],
  ir: ComponentIR,
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  propFieldNames: ReadonlySet<string>,
): void {
  const memoPropsParamMap = new Map(ir.metadata.propsParams.map(p => [p.name, p]))
  for (const memo of ir.metadata.memos) {
    const fieldName = capitalizeFieldName(memo.name)
    if (propFieldNames.has(fieldName)) continue
    const hoistedLocal = ctx.state.hoistedMemoLocals.get(memo.name)
    if (hoistedLocal) {
      lines.push(`\t\t${fieldName}: ${hoistedLocal},`)
      continue
    }
    // Pass the inferred Go type so an unresolved computation zeroes to that
    // type (`false` for a boolean memo), not the int `0`.
    const goType = inferMemoType(ctx, memo, ir.metadata.signals, memoPropsParamMap)
    const memoValue = computeMemoInitialValue(ctx, memo, ir.metadata.signals, ir.metadata.propsParams, propFallbackVars, goType)
    lines.push(`\t\t${fieldName}: ${memoValue},`)
    // No #2700 refusal check here (unlike `emitSignalFieldInits`): the
    // analyzer deliberately never sets `MemoInfo.parsed` to an
    // `object-literal` for an object-returning memo body (`() => ({…})`,
    // `analyzer.ts`'s own docstring — "isn't lowered from the parsed tree
    // yet") — a pre-existing, unrelated exclusion this fix doesn't touch.
    // Detecting the shape without `parsed` would mean re-parsing
    // `memo.computation` as text, which the repo's own convention (see
    // CLAUDE.md, "Never parse imports... with regex or string matching")
    // rules out. #2700's own reproduction and fixture are signal-only;
    // a memo-side refusal is left for whoever lands the "Roadmap A" memo
    // object-literal `parsed` support this comment references.
  }
}

/**
 * #2700: a `derived`-classified signal (`SsrSeedPlan`'s classification —
 * an object literal whose free identifiers ALL resolve in scope, e.g.
 * `createSignal({ ...base, done: true })`) whose value the
 * constructor-time baker (`convertInitialValue`) can't reproduce silently
 * keeps the field's Go zero value — that baker is static-only
 * (identifier/member/call operands defer, `parsed-literal-to-go.ts`'s own
 * docstring). Signal-only: the analyzer deliberately never sets
 * `MemoInfo.parsed` to an `object-literal` for an object-returning memo
 * body (`analyzer.ts`'s own docstring — "isn't lowered from the parsed
 * tree yet"), so there is no structural way to reach this check for a
 * memo without re-parsing `computation` as text, which the repo's own
 * convention rules out.
 *
 * Deferring silently is harmless UNLESS the SSR template actually reads
 * the field: a signal that only feeds a spread-attrs bag never reaches
 * here as a false positive because spread bags bake through their own
 * `.Spread_<slot>` route (`emitSpreadBagInits`), never `rootFieldRef` —
 * so `templateReadRootFields` (populated while `generate()` rendered the
 * template, which always precedes `generateTypes`'s call into this
 * function) is the exact structural proxy for "the zero value would
 * actually surface," not merely "the bake failed."
 *
 * Scoped to a NON-EMPTY free set on purpose, not every deferred bake: a
 * fully-static object literal (`createSignal({ id: 'row-1' })`) hits the
 * same `nil` fallback today but is a separate, untracked silent-divergence
 * shape with no fixture of its own — loud-ifying it here would silently
 * widen this fix beyond #2700's actual reproduction (a literal that
 * references a live prop/signal), so it's left for its own issue instead.
 */
function refuseUnbakeableDerivedObjectLiteral(
  ctx: GoEmitContext,
  name: string,
  loc: SourceLocation,
  frees: readonly string[],
): void {
  if (frees.length === 0) return
  if (!ctx.state.templateReadRootFields.has(name)) return
  ctx.state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `Signal '${name}' is seeded from an object literal that references live value(s) (${frees.join(', ')}) — the Go template adapter bakes object-typed signal values into Go source at New${ctx.state.componentName}Props time, and that baker is static-only (identifier/member/call operands defer), so the SSR template's read of it would see the Go zero value instead of the derived object.`,
    loc,
    suggestion: {
      message: `Wrap each SSR read of '${name}()' in /* @client */ so it renders on the client instead, or pass the already-derived object in as a prop.`,
      escape: [{ kind: 'client-directive' }],
    },
  })
}
