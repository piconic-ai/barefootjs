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

import type { ParsedExpr, ParsedStatement, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { CtorLowerEnv } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { lowerCtorExpr } from './ctor-lowering.ts'

/**
 * Recognise a block-body memo whose SSR path returns a module-const array when
 * the guard signal starts falsy:
 *   `() => { const k = getter(); if (!k) return MODULE_CONST; … }`
 *
 * The block is normalized to a single expression upstream (#2040,
 * `foldBlockToExpr` in the analyzer), so this reads the folded `MemoInfo.parsed`
 * conditional — `!getter() ? MODULE_CONST : <derived>` — instead of walking the
 * raw statements. When the guard signal's initial value is falsy, `!guard` is
 * `true`, so the `consequent` is the const rendered at SSR.
 *
 * @returns the constant's name, value, inferred type and parsed tree, or null
 */
export function resolveBlockBodyMemoModuleConst(
  ctx: GoEmitContext,
  parsed: ParsedExpr | undefined,
  signals: { getter: string; initialValue: string }[],
): {
  constName: string
  constValue: string | undefined
  constType: TypeInfo | undefined
  constParsed: ParsedExpr | undefined
} | null {
  // `!<signalGetter>() ? <const> : <derived>`
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

  // The guard signal must start falsy (null, '', 0, false), so `!guard` is true
  // and the consequent is the SSR value.
  const guardSignal = signals.find(sg => sg.getter === (guardCall.callee as { name: string }).name)
  if (!guardSignal) return null
  const iv = guardSignal.initialValue.trim()
  if (iv !== 'null' && iv !== "''" && iv !== '""' && iv !== '0' && iv !== 'false') {
    return null
  }

  // The consequent must be a bare reference to a module-scope constant.
  const ret = parsed.consequent
  if (ret.kind !== 'identifier') return null
  const constant = ctx.state.localConstants.find(
    c => c.name === ret.name && c.origin?.scope === 'module',
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
  memo: { parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean },
): string | null {
  // An incomplete block (`parsedBlockComplete === false`) means a statement was
  // omitted from the tolerant parse — it could hide control flow this resolver
  // can't model, so bail to the nil fallback.
  if (!memo.parsedBlock || !memo.parsedBlockComplete) return null

  // Accept only a strict shape: zero or more `const`/`let` declarations
  // followed by exactly one `return { … }` as the LAST statement. Any other
  // statement kind — `if`, an early/extra `return` — means the block has
  // control flow this resolver can't reason about, so bail to the nil fallback
  // rather than silently lowering one of several returns. Along the way,
  // collect `const <v> = searchParams()` bindings (the env for `<v>.get('k')`).
  const searchParamsVars = new Set<string>()
  let retObj: Extract<ParsedExpr, { kind: 'object-literal' }> | null = null
  const statements = memo.parsedBlock
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i]
    if (s.kind === 'var-decl') {
      // `const <v> = searchParams()` — a zero-arg call to a searchParams
      // local. Any other var-decl is accepted and ignored.
      if (
        s.init.kind === 'call' &&
        s.init.callee.kind === 'identifier' &&
        s.init.args.length === 0 &&
        ctx.state.searchParamsLocals.has(s.init.callee.name)
      ) {
        searchParamsVars.add(s.name)
      }
      continue
    }
    if (s.kind === 'return') {
      // The return must be the last statement (so it's the only one) and
      // return an object literal.
      if (i !== statements.length - 1 || s.value.kind !== 'object-literal') return null
      retObj = s.value
      continue
    }
    // Any other statement kind (`if`) → control flow we don't model → bail.
    return null
  }
  if (!retObj || retObj.properties.length === 0) return null

  const env: CtorLowerEnv = { searchParamsVars, params: new Map() }
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
