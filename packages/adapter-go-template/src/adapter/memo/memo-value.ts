/**
 * Memo value computation for block-body / object-returning memos.
 *
 * Free functions over a {@link GoEmitContext}:
 *   - `resolveBlockBodyMemoModuleConst` recognises a guard-and-return-module-
 *     const memo and reports the constant, reading `state.localConstants`.
 *   - `computeObjectMemoInitialValue` lowers a `searchParams()`-derived
 *     object-returning memo to a Go `map[string]interface{}` literal, reading
 *     the analyzer-carried `parsedBlock` and `state.searchParamsLocals` and
 *     delegating value lowering to `lowerCtorExpr`.
 */

import { foldBlockToExpr } from '@barefootjs/jsx'
import type { ParsedExpr, ParsedStatement, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { CtorLowerEnv } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { lowerCtorExpr } from './ctor-lowering.ts'

type GuardConstResult = {
  constName: string
  constValue: string | undefined
  constType: TypeInfo | undefined
  constParsed: ParsedExpr | undefined
}

const FALSY_INITS = new Set(['null', "''", '""', '0', 'false'])

/** Look the returned const name up as a module-scope constant and package it. */
function packageModuleConst(ctx: GoEmitContext, name: string): GuardConstResult | null {
  const constant = ctx.state.localConstants.find(
    c => c.name === name && c.origin?.scope === 'module',
  )
  if (!constant) return null
  return {
    constName: constant.name,
    constValue: constant.value,
    constType: constant.type ?? undefined,
    constParsed: constant.parsed,
  }
}

/**
 * Recognise a block-body memo whose SSR path returns a module-const array when
 * the guard signal starts falsy:
 *   `() => { const k = getter(); if (!k) return MODULE_CONST; … }`
 *
 * Primary path: the block is normalized to a single expression upstream (#2040,
 * `foldBlockToExpr` in the analyzer), so this reads the folded `MemoInfo.parsed`
 * conditional `!getter() ? MODULE_CONST : <derived>`. When the guard signal's
 * initial value is falsy, `!guard` is `true`, so the `consequent` is the const
 * rendered at SSR.
 *
 * Fallback path: a block the fold REFUSES (e.g. an impure local binding that
 * isn't used exactly once per path sits alongside the guard) leaves
 * `MemoInfo.parsed` unset, but the guard prefix is still present in the tolerant
 * `MemoInfo.parsedBlock`. Scan that prefix so the SSR const bake matches `main`
 * exactly — the bake depends only on the guard, not on the unfoldable tail.
 *
 * @returns the constant's name, value, inferred type and parsed tree, or null
 */
export function resolveBlockBodyMemoModuleConst(
  ctx: GoEmitContext,
  memo: { parsed?: ParsedExpr; parsedBlock?: ParsedStatement[] },
  signals: { getter: string; initialValue: string }[],
): GuardConstResult | null {
  return (
    fromFoldedConditional(ctx, memo.parsed, signals) ??
    fromStatementPrefix(ctx, memo.parsedBlock, signals)
  )
}

/** Primary: read the folded `!getter() ? MODULE_CONST : <derived>` conditional. */
function fromFoldedConditional(
  ctx: GoEmitContext,
  parsed: ParsedExpr | undefined,
  signals: { getter: string; initialValue: string }[],
): GuardConstResult | null {
  if (!parsed || parsed.kind !== 'conditional') return null
  const test = parsed.test
  if (test.kind !== 'unary' || test.op !== '!') return null
  const guardCall = test.argument
  if (
    guardCall.kind !== 'call' ||
    guardCall.callee.kind !== 'identifier' ||
    guardCall.args.length !== 0
  ) {
    return null
  }
  const guardSignal = signals.find(sg => sg.getter === (guardCall.callee as { name: string }).name)
  if (!guardSignal || !FALSY_INITS.has(guardSignal.initialValue.trim())) return null
  // `!falsy` is true → the consequent is the returned module const.
  if (parsed.consequent.kind !== 'identifier') return null
  return packageModuleConst(ctx, parsed.consequent.name)
}

/**
 * Fallback for blocks the fold refused: scan the tolerant statements for the
 * guard prefix `const k = getter(); if (!k) return MODULE_CONST` (later
 * statements are ignored — they don't affect the guard-falsy SSR value).
 */
function fromStatementPrefix(
  ctx: GoEmitContext,
  parsedBlock: ParsedStatement[] | undefined,
  signals: { getter: string; initialValue: string }[],
): GuardConstResult | null {
  if (!parsedBlock) return null
  const varToSignal = new Map<string, string>()
  let guardSignalGetter: string | null = null
  let returnedConst: string | null = null

  for (const s of parsedBlock) {
    if (s.kind === 'var-decl' && s.init.kind === 'call' && s.init.callee.kind === 'identifier') {
      const callee = s.init.callee.name
      if (signals.some(sg => sg.getter === callee)) varToSignal.set(s.name, callee)
    }
    if (
      s.kind === 'if' &&
      s.condition.kind === 'unary' &&
      s.condition.op === '!' &&
      s.condition.argument.kind === 'identifier'
    ) {
      const signalGetter = varToSignal.get(s.condition.argument.name)
      if (!signalGetter) continue
      for (const rs of s.consequent) {
        if (rs.kind === 'return' && rs.value.kind === 'identifier') {
          guardSignalGetter = signalGetter
          returnedConst = rs.value.name
        }
      }
    }
    if (guardSignalGetter && returnedConst) break
  }

  if (!guardSignalGetter || !returnedConst) return null
  const guardSignal = signals.find(sg => sg.getter === guardSignalGetter)
  if (!guardSignal || !FALSY_INITS.has(guardSignal.initialValue.trim())) return null
  return packageModuleConst(ctx, returnedConst)
}

/**
 * Compute the SSR value of an object-returning block-body memo derived from
 * `searchParams()`:
 *   () => { const sp = searchParams(); return { sort: asSortKey(sp.get('sort')),
 *                                               tag: sp.get('tag') ?? '' } }
 * Emits a Go `map[string]interface{}{ "Sort": …, "Tag": … }` whose values are
 * lowered from the request query (see `lowerCtorExpr`). Keys are capitalized to
 * match the template's `.Params.<Field>` map access.
 *
 * @returns the Go map literal, or null for any shape the lowerer can't
 *   represent (→ nil-map fallback)
 */
export function computeObjectMemoInitialValue(
  ctx: GoEmitContext,
  memo: { parsed?: ParsedExpr; parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean },
): string | null {
  // Normalize the block to a single object-literal expression (#2040). The
  // analyzer's fold treats only signal/memo reads as pure, so a
  // `const sp = searchParams()` (read twice) isn't folded there; redo the fold
  // here with `searchParams` added to the purity oracle — it is an idempotent
  // request-query read, so inlining `sp` at each `sp.get('k')` site is sound.
  // The folded object's values become `searchParams().get('k')` (sp inlined),
  // lowered by `lowerCtorExpr`. A block that doesn't fold to an object literal
  // (extra control flow, an impure non-searchParams binding) yields null → the
  // caller's nil fallback, exactly as the previous statement walk did.
  let retObj = memo.parsed?.kind === 'object-literal' ? memo.parsed : null
  if (!retObj) {
    if (!memo.parsedBlock || !memo.parsedBlockComplete) return null
    const folded = foldBlockToExpr(memo.parsedBlock, {
      pureCallNames: ctx.state.searchParamsLocals,
    })
    if (!folded.ok || folded.expr.kind !== 'object-literal') return null
    retObj = folded.expr
  }
  if (retObj.properties.length === 0) return null

  // `sp` is inlined to `searchParams()` in the folded values, so no
  // local→searchParams var env is needed; `lowerCtorExpr` recognises the
  // `searchParams().get('k')` receiver shape directly.
  const env: CtorLowerEnv = { searchParamsVars: new Set(), params: new Map() }
  const entries: string[] = []
  for (const prop of retObj.properties) {
    // Bail on a shorthand property (`return { tag }`): its value is a bare
    // identifier whose name need not match a `.Params.<Field>` accessor.
    if (prop.shorthand) return null
    // The key must be identifier- or string-named (a numeric key has no
    // matching `.Params.<Field>` accessor).
    if (prop.keyKind !== undefined && prop.keyKind !== 'identifier' && prop.keyKind !== 'string') {
      return null
    }
    const go = lowerCtorExpr(ctx, prop.value, env)
    if (go === null) return null
    entries.push(`"${capitalizeFieldName(prop.key)}": ${go}`)
  }
  return `map[string]interface{}{\n\t\t${entries.join(',\n\t\t')},\n\t}`
}
