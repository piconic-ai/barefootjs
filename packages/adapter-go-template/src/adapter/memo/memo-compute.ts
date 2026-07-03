/**
 * Memo initial-value computation — lower a memo's computation to its SSR initial
 * value as a Go expression.
 *
 * Free functions over a {@link GoEmitContext}. `computeMemoInitialValue` is the
 * typed-field entry (zero-value defaulting); `computeMemoInitialValueOrNull` is
 * the pattern-matching core dispatching over template-literal, parsed-body,
 * comparison-ternary, block-body and object memo shapes.
 */

import type { ParsedExpr, ParsedStatement, TypeInfo } from '@barefootjs/jsx'
import {
  asCallbackMethodCall,
  freeVarsInBody,
  materializeGetterCalls,
  serializeParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { escapeGoString } from '../lib/go-emit.ts'
import { convertInitialValue, getSignalInitialValueAsGo } from '../value/value-lowering.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'
import { computeTemplateLiteralMemoInitialValue } from './template-interp.ts'
import { resolveBlockBodyMemoModuleConst, computeObjectMemoInitialValue } from './memo-value.ts'

/** Default for the optional `propFallbackVars` argument. */
const EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

/** A bare zero-arg getter call (`count()`) → its name, else null. */
function getterCallName(e: ParsedExpr): string | null {
  return e.kind === 'call' && e.callee.kind === 'identifier' && e.args.length === 0
    ? e.callee.name
    : null
}

/** A `props.X` member access → the prop name, else null. */
function propsMemberName(e: ParsedExpr): string | null {
  return e.kind === 'member' &&
    !e.computed &&
    e.object.kind === 'identifier' &&
    e.object.name === 'props'
    ? e.property
    : null
}

/** A `() => props.X.filter((p) => <predicate>)` match: the array prop name,
 *  the predicate serialized to the runtime evaluator's ParsedExpr JSON, the
 *  arrow's param name, and the free variable names its predicate captures.
 *  Null when `body` isn't this shape, `propName` doesn't resolve to a known
 *  prop, or the predicate isn't representable (`serializeParsedExpr` refusal).
 *  Shared by the SSR-value emitter ({@link memoInitialFromParsedBody}) and the
 *  constructor's sibling-memo hoisting pre-pass so both walk the shape
 *  identically. */
export function matchFilterArmMemo(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
): { propName: string; predJSON: string; paramName: string; freeVars: string[] } | null {
  const cb = asCallbackMethodCall(body)
  if (!cb || cb.method !== 'filter') return null
  const propName = propsMemberName(cb.object)
  const param = propName ? propsParams.find(p => p.name === propName) : undefined
  if (!propName || !param) return null

  // Single authority (Package G plan): every step that isn't `env-reader` is
  // value-materializable at SSR time — env readers are per-request readers
  // the runtime evaluator can't invoke, so they're excluded here exactly as
  // the plan's own consumers exclude them.
  const knownGetterNames = new Set<string>(
    ctx.state.ssrSeedPlan.steps.filter(s => s.kind !== 'env-reader').map(s => s.name),
  )

  const materialized = materializeGetterCalls(cb.arrow.body, knownGetterNames)
  const predJSON = serializeParsedExpr(materialized)
  if (predJSON === null) return null

  const paramName = cb.arrow.params[0] ?? '_'
  const freeVars = freeVarsInBody(materialized, new Set(cb.arrow.params))
  return { propName, predJSON, paramName, freeVars }
}

/**
 * Names of EARLIER sibling memos (per `ctx.state.currentMemos` declaration
 * order) that a filter-arm memo's predicate free variables resolve to — the
 * constructor generator hoists these into a shared local so the sibling's
 * expression isn't emitted twice (once for its own field, once inlined in
 * this memo's `bf.FilterEval` env map, #2075/#2077 review finding 3). Empty
 * when `memo` isn't a filter-arm memo or references nothing hoistable.
 */
export function filterArmEarlierSiblingRefs(
  ctx: GoEmitContext,
  memo: { name: string; parsed?: ParsedExpr },
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
): string[] {
  if (!memo.parsed) return []
  const match = matchFilterArmMemo(ctx, memo.parsed, signals, propsParams)
  if (!match) return []
  // `currentMemos` order equals the plan's memo-step order (plan lists
  // signals first, then memos, both in declaration order) — kept here rather
  // than filtering `ssrSeedPlan.steps` since this index is memo-only already.
  const memos = ctx.state.currentMemos ?? []
  const currentIndex = memos.findIndex(m => m.name === memo.name)
  if (currentIndex < 0) return []
  const refs: string[] = []
  for (const name of match.freeVars) {
    const idx = memos.findIndex(m => m.name === name)
    if (idx >= 0 && idx < currentIndex) refs.push(name)
  }
  return refs
}

/**
 * Compute a memo's SSR initial value as a Go expression — e.g.
 * `() => count() * 2` → `in.Initial * 2`, `() => props.value * 10` →
 * `in.Value * 10`. Unresolved computations default to the memo's Go zero value.
 *
 * @param propFallbackVars when a hoisted fallback var exists for a referenced
 *   prop, it is substituted for `in.FieldName` so the memo inherits the
 *   signal-time `??` fallback
 * @param goType Go type of the memo field, used to pick the zero-value fallback
 */
export function computeMemoInitialValue(
  ctx: GoEmitContext,
  memo: { name: string; computation: string; deps: string[]; parsed?: ParsedExpr },
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  goType?: string,
): string {
  // Seed the resolution stack with this memo's own name — every external call
  // is a fresh top-level computation, so self-reference must be caught on the
  // very first recursion, not only on the second visit.
  const resolved = computeMemoInitialValueOrNull(
    ctx, memo, signals, propsParams, propFallbackVars, new Set([memo.name]),
  )
  if (resolved !== null) return resolved
  // Zero value for the memo's Go type: `false` for bool, `""` for string,
  // `nil` for reference types (map / slice / interface / pointer — `0` is not
  // assignable to them), else the int `0`.
  if (goType === 'bool') return 'false'
  if (goType === 'string') return '""'
  if (
    goType !== undefined &&
    (goType.startsWith('map[') ||
      goType.startsWith('[]') ||
      goType.startsWith('*') ||
      goType.includes('interface{}') ||
      goType === 'any')
  ) {
    return 'nil'
  }
  return '0'
}

/**
 * Structural matcher for the common expression-bodied memo shapes, driven by
 * the analyzer-attached `MemoInfo.parsed` (the memo arrow's body): `getter() ===
 * 'lit'`, `props.X ?? false`, `cond() ? A : B`, `<getter()|props.X|var> <*+-/>
 * <int>`, and bare `getter()` / `props.X` / `var`.
 *
 * @returns the Go SSR value, or null when the body is none of these (the caller
 *   then falls through to comparison-ternary / block-body / object-memo handling)
 */
export function memoInitialFromParsedBody(
  ctx: GoEmitContext,
  body: ParsedExpr,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  currentMemoName: string,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const propRef = (propName: string): string => {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(propName)}`
  }
  // A request-scoped env-signal read (`searchParams().get('k')`, any local
  // alias, #1922) → the literal key and the reader's canonical field name,
  // else null. Constraints: the receiver must be a zero-arg call of a local
  // bound to a registered env signal (`ctx.state.envSignalReadersByLocal`,
  // keyed by that reader's own registration — not a hardcoded key); the
  // method must be one that reader's `methods` set recognises; the key
  // argument must be a string literal.
  const envGetKey = (e: ParsedExpr): { key: string; fieldName: string } | null => {
    if (e.kind !== 'call' || e.callee.kind !== 'member' || e.callee.computed) return null
    const recvName = getterCallName(e.callee.object)
    if (recvName === null) return null
    const reader = ctx.state.envSignalReadersByLocal.get(recvName)
    if (!reader || !reader.methods.has(e.callee.property)) return null
    const arg = e.args[0]
    if (!arg || arg.kind !== 'literal' || arg.literalType !== 'string') return null
    return { key: String(arg.value), fieldName: capitalizeFieldName(reader.canonicalName) }
  }

  // () => searchParams().get('k') — a derived memo over the env signal
  // (#2069). The constructor reads the canonical `in.SearchParams` reader the
  // handler fills per request, so the memo SSR-computes instead of zero-valuing.
  {
    const m = envGetKey(body)
    if (m !== null) return `in.${m.fieldName}.Get(${JSON.stringify(m.key)})`
  }

  // () => searchParams().get('k') ?? '<lit>' — the defaulted form. Go's
  // `SearchParams.Get` returns "" for an absent key (it can't surface JS's
  // null), so the default fires on "" — the same documented `?? → or`
  // divergence as the template-position lowering (`or (.SearchParams.Get
  // "k") "<lit>"`); the two positions stay consistent.
  if (
    body.kind === 'logical' &&
    (body.op === '??' || body.op === '||') &&
    body.right.kind === 'literal' &&
    body.right.literalType === 'string'
  ) {
    const m = envGetKey(body.left)
    if (m !== null) {
      const def = JSON.stringify(String(body.right.value))
      return `func() string { if v := in.${m.fieldName}.Get(${JSON.stringify(m.key)}); v != "" { return v }; return ${def} }()`
    }
  }

  // () => props.X.filter((p) => <predicate>) — a LIST-valued derived memo
  // chained off a sibling memo the predicate closes over (e.g. a
  // searchParams()-derived `tag`). Env-signal getters are excluded from the
  // free-var materialization set: they're per-request READERS, not values,
  // and the runtime evaluator has no way to invoke one.
  {
    const match = matchFilterArmMemo(ctx, body, signals, propsParams)
    if (match) {
      const { propName, predJSON, paramName, freeVars } = match
      const currentIndex = (ctx.state.currentMemos ?? []).findIndex(m => m.name === currentMemoName)
      const envEntries: string[] = []
      let unresolved = false
      for (const name of freeVars) {
        let goExpr: string | null = null
        const siblingIndex = (ctx.state.currentMemos ?? []).findIndex(m => m.name === name)
        if (siblingIndex >= 0) {
          // Only a sibling declared EARLIER than the memo being computed is
          // eligible — mirrors JS declaration order and rules out both
          // self-reference and any mutual pair (at most one direction can
          // satisfy `earlier`), independent of the resolving-stack guard
          // below. A hoisted local (the constructor emitted it once already,
          // #2075/#2077 review finding 3) is reused verbatim instead of
          // recomputing the expression a second time.
          const siblingMemo = ctx.state.currentMemos![siblingIndex]
          const eligible = currentIndex >= 0 && siblingIndex < currentIndex && !resolving.has(siblingMemo.name)
          if (eligible) {
            const hoisted = ctx.state.hoistedMemoLocals.get(siblingMemo.name)
            goExpr = hoisted ?? computeMemoInitialValueOrNull(
              ctx, siblingMemo, signals, propsParams, propFallbackVars,
              new Set([...resolving, siblingMemo.name]),
            )
          }
        } else {
          const sig = signals.find(s => s.getter === name)
          if (sig) {
            goExpr = getSignalInitialValueAsGo(ctx, sig.initialValue, propsParams, propFallbackVars)
          } else {
            const p = propsParams.find(pp => pp.name === name)
            if (p) goExpr = propRef(name)
          }
        }
        if (goExpr === null) {
          unresolved = true
          break
        }
        envEntries.push(`${JSON.stringify(name)}: ${goExpr}`)
      }
      if (!unresolved) {
        const itemsField = `in.${capitalizeFieldName(propName)}`
        const envMap = `map[string]any{${envEntries.join(', ')}}`
        return `bf.FilterEval(${itemsField}, "${escapeGoString(predJSON)}", ${JSON.stringify(paramName)}, ${envMap})`
      }
    }
  }

  // () => getter() === 'lit' / !== 'lit' — a selection memo. Resolves to a Go
  // bool when the signal's initial value is itself a string literal.
  if (
    body.kind === 'binary' &&
    ['===', '!==', '==', '!='].includes(body.op) &&
    body.right.kind === 'literal' &&
    body.right.literalType === 'string'
  ) {
    const depName = getterCallName(body.left)
    if (depName) {
      const lit = String(body.right.value)
      const signal = signals.find(sg => sg.getter === depName)
      const initLit = signal ? /^'([^'\\]*)'$/.exec(signal.initialValue.trim()) : null
      if (initLit) {
        const equal = initLit[1] === lit
        return String(body.op.startsWith('!') ? !equal : equal)
      }
    }
  }

  // () => props.X ?? false — a boolean passthrough memo. Go's bool zero value
  // IS the `?? false` fallback, so the raw input field carries it exactly.
  if (
    body.kind === 'logical' &&
    body.op === '??' &&
    body.right.kind === 'literal' &&
    body.right.value === false
  ) {
    const propName = propsMemberName(body.left)
    if (propName) return propRef(propName)
  }

  // () => cond() ? A : B where each branch is a module string const or a
  // string literal, and `cond` is a signal/memo this resolver can evaluate.
  if (body.kind === 'conditional') {
    const condName = getterCallName(body.test)
    if (condName) {
      const resolveBranch = (b: ParsedExpr): string | null => {
        if (b.kind === 'literal' && b.literalType === 'string') return JSON.stringify(b.value)
        if (b.kind === 'identifier') {
          const constVal = ctx.state.moduleStringConsts.get(b.name)
          return constVal !== undefined ? JSON.stringify(constVal) : null
        }
        return null
      }
      const t = resolveBranch(body.consequent)
      const f = resolveBranch(body.alternate)
      if (t !== null && f !== null) {
        let condGo: string | null = null
        const condSignal = signals.find(sg => sg.getter === condName)
        if (condSignal) {
          condGo = getSignalInitialValueAsGo(ctx, condSignal.initialValue, propsParams, propFallbackVars)
        } else {
          const condMemo = (ctx.state.currentMemos ?? []).find(m => m.name === condName)
          // A condition memo already on the resolution stack (self- or
          // mutually-referencing ternaries) falls back to null — the same
          // zero-value default as any other unresolved shape — instead of
          // recursing forever.
          if (condMemo && !resolving.has(condMemo.name)) {
            condGo = computeMemoInitialValueOrNull(
              ctx, condMemo, signals, propsParams, propFallbackVars,
              new Set([...resolving, condMemo.name]),
            )
          }
        }
        if (condGo === 'true') return t
        if (condGo === 'false') return f
        if (condGo !== null) {
          return `func() string { if ${condGo} { return ${t} }; return ${f} }()`
        }
      }
    }
  }

  // () => <ref> <*|+|-|/> <non-negative int>. The operand must be a
  // non-negative integer literal; float/negative bodies fall through unchanged.
  if (
    body.kind === 'binary' &&
    ['*', '+', '-', '/'].includes(body.op) &&
    body.right.kind === 'literal' &&
    body.right.literalType === 'number' &&
    typeof body.right.value === 'number' &&
    Number.isInteger(body.right.value) &&
    body.right.value >= 0
  ) {
    const operator = body.op
    const operand = String(body.right.value)

    // getter() * N — return the signal's Go initial value times N.
    const depName = getterCallName(body.left)
    if (depName) {
      const signal = signals.find(s => s.getter === depName)
      if (signal) {
        const signalInitial = getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars)
        return `${signalInitial} ${operator} ${operand}`
      }
    }

    // props.X * N — hoisted var if any, else the input field (asserting int
    // when the field lowers to interface{}).
    const propName = propsMemberName(body.left)
    if (propName) {
      const param = propsParams.find(p => p.name === propName)
      if (param) {
        const hoisted = propFallbackVars.get(propName)
        if (hoisted) return `${hoisted.varName} ${operator} ${operand}`
        const fieldName = capitalizeFieldName(propName)
        if (param.type) {
          const goType = typeInfoToGo(ctx, param.type, param.defaultValue)
          if (goType === 'interface{}') return `in.${fieldName}.(int) ${operator} ${operand}`
        }
        return `in.${fieldName} ${operator} ${operand}`
      }
    }

    // var * N — destructured prop (no hoisted-var lookup).
    if (body.left.kind === 'identifier') {
      const varName = body.left.name
      const param = propsParams.find(p => p.name === varName)
      if (param) {
        const fieldName = capitalizeFieldName(varName)
        if (param.type) {
          const goType = typeInfoToGo(ctx, param.type, param.defaultValue)
          if (goType === 'interface{}') return `in.${fieldName}.(int) ${operator} ${operand}`
        }
        return `in.${fieldName} ${operator} ${operand}`
      }
    }
  }

  // () => getter() — just return the signal's Go initial value.
  const simpleDep = getterCallName(body)
  if (simpleDep) {
    const signal = signals.find(s => s.getter === simpleDep)
    if (signal) {
      return getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars)
    }
  }

  // () => props.X — return the prop value (hoisted-aware).
  const simpleProp = propsMemberName(body)
  if (simpleProp) {
    const param = propsParams.find(p => p.name === simpleProp)
    if (param) return propRef(simpleProp)
  }

  // () => var — destructured prop, return the input field directly.
  if (body.kind === 'identifier') {
    const param = propsParams.find(p => p.name === body.name)
    if (param) return `in.${capitalizeFieldName(body.name)}`
  }

  return null
}

/**
 * Pattern-matching core of `computeMemoInitialValue`.
 *
 * @returns the memo's SSR initial value as a Go expression, or `null` when no
 *   pattern applies. Callers with a typed field to fill use the
 *   zero-value-defaulting wrapper above; callers that can OMIT the field (a
 *   child-instance prop init, where Go's zero values then apply with the right
 *   type) use this directly.
 */
export function computeMemoInitialValueOrNull(
  ctx: GoEmitContext,
  memo: { name: string; computation: string; deps: string[]; parsed?: ParsedExpr; parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean },
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  /**
   * Memo names currently being resolved on this call stack — guards against
   * unbounded recursion when memos reference each other (mutually, or a
   * self-reference). Callers that start a fresh top-level computation seed
   * this with `memo.name`; recursive calls extend it with the sibling memo
   * about to be entered. A candidate already in the set resolves to `null`
   * (the shape's usual "unsupported" fallback) instead of recursing.
   */
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const computation = memo.computation

  // () => `...${expr}...` — template-literal memo (the classes memo). Builds a
  // Go string concatenation; null when any interpolation isn't representable.
  const tmplMemo = computeTemplateLiteralMemoInitialValue(ctx, memo, propsParams)
  if (tmplMemo !== null) return tmplMemo

  // Expression-bodied memo shapes, matched structurally on `parsed`.
  if (memo.parsed) {
    const fromParsed = memoInitialFromParsedBody(
      ctx,
      memo.parsed,
      signals,
      propsParams,
      propFallbackVars,
      memo.name,
      resolving,
    )
    if (fromParsed !== null) return fromParsed
  }

  // () => <operand> ===/!== 'lit' ? A : B, where each branch is a string
  // literal/module-const and <operand> is a getter call, an inline
  // nullish-defaulted prop (`props.X ?? 'horizontal'`), or a bare `props.X`.
  const cmpTernary = computeComparisonTernaryGo(
    ctx,
    memo.parsed,
    signals,
    propsParams,
    propFallbackVars,
    resolving,
  )
  if (cmpTernary !== null) return cmpTernary

  // Block-body memo that early-returns a module-const array when a guard signal
  // is falsy: `() => { const k = getter(); if (!k) return MODULE_ARRAY; … }`.
  // When the signal starts null the SSR value is that array; its literal value
  // (not the identifier) is passed to the baker so it reduces to a Go slice.
  const blockReturn = resolveBlockBodyMemoModuleConst(ctx, memo, signals)
  if (blockReturn !== null && blockReturn.constValue && blockReturn.constType) {
    return convertInitialValue(ctx,
      blockReturn.constValue,
      blockReturn.constType,
      propsParams,
      blockReturn.constParsed,
    )
  }

  // Object-returning block-body memo derived from `searchParams()`. Computes a
  // Go `map[string]interface{}` whose values are lowered from the request
  // query, so `.Params.Sort` etc. resolve at execute time instead of reading a
  // nil map; null for any unsupported shape (→ nil fallback).
  const objMemo = computeObjectMemoInitialValue(ctx, memo)
  if (objMemo !== null) return objMemo

  return null
}

/**
 * Resolve a signal/memo getter NAME to a Go value expression, for use as the
 * condition operand of another memo's ternary. Handles a plain signal, a
 * prop-shadow memo `() => props.X ?? 'lit'` (→ a nil/empty-tolerant field
 * read), else recurses.
 *
 * @returns the Go expression, or null when the shape isn't representable
 */
export function resolveGetterValueAsGo(
  ctx: GoEmitContext,
  name: string,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  const signal = signals.find(s => s.getter === name)
  if (signal) {
    return getSignalInitialValueAsGo(ctx, signal.initialValue, propsParams, propFallbackVars)
  }
  const memo = (ctx.state.currentMemos ?? []).find(m => m.name === name)
  if (memo) {
    // Already on the resolution stack (self- or mutually-referencing
    // ternary operands) — fall back to null rather than recurse forever.
    if (resolving.has(memo.name)) return null
    const stripped = memo.computation.replace(/^\(\)\s*=>\s*/, '')
    const fb = ctx.extractPropFallback(stripped)
    if (fb && capitalizeFieldName(fb.propName) === capitalizeFieldName(memo.name)) {
      const field = `in.${capitalizeFieldName(fb.propName)}`
      return `func() interface{} { v := interface{}(${field}); if v == nil || v == "" { return ${fb.goFallback} }; return v }()`
    }
    return computeMemoInitialValueOrNull(
      ctx, memo, signals, propsParams, propFallbackVars, new Set([...resolving, memo.name]),
    )
  }
  const param = propsParams.find(p => p.name === name)
  if (param) {
    const hoisted = propFallbackVars.get(name)
    return hoisted ? hoisted.varName : `in.${capitalizeFieldName(name)}`
  }
  return null
}

/**
 * Resolve a string-ternary memo whose condition is a literal comparison —
 * `() => <operand> === 'lit' ? A : B` (or `!==`) — to a Go runtime conditional.
 * Branches must be string literals/module-string-consts; the operand resolves
 * via `resolveComparisonOperandGo`.
 *
 * @returns the Go conditional, or null when the shape isn't supported
 */
export function computeComparisonTernaryGo(
  ctx: GoEmitContext,
  parsed: ParsedExpr | undefined,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  // Matches any `conditional` `parsed` — an expression-bodied ternary or, since
  // #2040, a block-bodied memo whose value `if` / early-return folded to one.
  if (!parsed || parsed.kind !== 'conditional') return null
  const cond = parsed.test
  if (cond.kind !== 'binary' || !(cond.right.kind === 'literal' && cond.right.literalType === 'string')) {
    return null
  }
  const isEq = cond.op === '===' || cond.op === '=='
  const isNe = cond.op === '!==' || cond.op === '!='
  if (!isEq && !isNe) return null

  const branch = (bn: ParsedExpr): string | null => {
    if (bn.kind === 'literal' && bn.literalType === 'string') {
      return JSON.stringify(bn.value)
    }
    if (bn.kind === 'identifier') {
      const cv = ctx.state.moduleStringConsts.get(bn.name)
      return cv !== undefined ? JSON.stringify(cv) : null
    }
    return null
  }
  const t = branch(parsed.consequent)
  const f = branch(parsed.alternate)
  if (t === null || f === null) return null

  const condGo = resolveComparisonOperandGo(
    ctx,
    cond.left,
    signals,
    propsParams,
    propFallbackVars,
    resolving,
  )
  if (condGo === null) return null

  // `consequent` fires when the comparison holds; for `!==` the branches swap.
  const eqBranch = isEq ? t : f
  const neBranch = isEq ? f : t
  return `func() string { if ${condGo} == ${JSON.stringify(cond.right.value)} { return ${eqBranch} }; return ${neBranch} }()`
}

/**
 * Resolve the left operand of a string-ternary memo's comparison condition to a
 * Go expression: a zero-arg getter call (a signal/prop-shadow memo), an inline
 * `props.X ?? 'def'` (folds the default), or a bare `props.X`.
 *
 * @returns the Go expression, or null for anything else
 */
export function resolveComparisonOperandGo(
  ctx: GoEmitContext,
  node: ParsedExpr,
  signals: { getter: string; initialValue: string }[],
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
  resolving: ReadonlySet<string> = new Set(),
): string | null {
  // getter(): a signal or memo getter call.
  if (node.kind === 'call' && node.callee.kind === 'identifier' && node.args.length === 0) {
    return resolveGetterValueAsGo(ctx, node.callee.name, signals, propsParams, propFallbackVars, resolving)
  }
  // props.X ?? 'def' — nil/empty-tolerant field read with the default folded in.
  if (node.kind === 'logical' && node.op === '??' && node.right.kind === 'literal' && node.right.literalType === 'string') {
    const propName = propsAccessNameFromParsed(ctx, node.left)
    if (propName) {
      const field = `in.${capitalizeFieldName(propName)}`
      return `func() interface{} { v := interface{}(${field}); if v == nil || v == "" { return ${JSON.stringify(node.right.value)} }; return v }()`
    }
  }
  // Bare props.X.
  const direct = propsAccessNameFromParsed(ctx, node)
  if (direct) return `in.${capitalizeFieldName(direct)}`
  return null
}

/**
 * `ParsedExpr` counterpart of `propsAccessName`: if `node` is a
 * `<propsObjectName>.<name>` member access, return `<name>`, else null.
 */
function propsAccessNameFromParsed(ctx: GoEmitContext, node: ParsedExpr): string | null {
  if (node.kind !== 'member' || node.computed) return null
  if (node.object.kind !== 'identifier') return null
  if (!ctx.state.propsObjectName || node.object.name !== ctx.state.propsObjectName) return null
  return node.property
}
