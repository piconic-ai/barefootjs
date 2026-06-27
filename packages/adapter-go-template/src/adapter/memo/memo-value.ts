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
import { parsedExprToParsedExpr2 } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { CtorLowerEnv } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { lowerCtorExpr } from './ctor-lowering.ts'

/**
 * (#1897) Recognises a block-body memo whose SSR path returns a module-const
 * array when the guard signal starts falsy:
 *   `() => { const k = getter(); if (!k) return MODULE_CONST; … }`
 * Returns the constant's name and inferred type, or null.
 */
export function resolveBlockBodyMemoModuleConst(
  ctx: GoEmitContext,
  parsedBlock: ParsedStatement[] | undefined,
  signals: { getter: string; initialValue: string }[],
): {
  constName: string
  constValue: string | undefined
  constType: TypeInfo | undefined
  constParsed: ParsedExpr | undefined
} | null {
  if (!parsedBlock) return null

  // Walk the analyzer-carried statements collecting:
  //   const <varName> = <signalGetter>()   →  varToSignal map
  //   if (!<varName>) return <moduleConst>  →  match varName back to signal
  const varToSignal = new Map<string, string>()
  let guardSignalGetter: string | null = null
  let returnedConst: string | null = null

  for (const s of parsedBlock) {
    if (s.kind === 'var-decl' && s.init.kind === 'call' && s.init.callee.kind === 'identifier') {
      const callee = s.init.callee.name
      if (signals.some(sg => sg.getter === callee)) {
        varToSignal.set(s.name, callee)
      }
    }
    if (
      s.kind === 'if' &&
      s.condition.kind === 'unary' &&
      s.condition.op === '!' &&
      s.condition.argument.kind === 'identifier'
    ) {
      const guardVar = s.condition.argument.name
      const signalGetter = varToSignal.get(guardVar)
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

  // The guard signal must start falsy (null, '', 0, false)
  const guardSignal = signals.find(sg => sg.getter === guardSignalGetter)
  if (!guardSignal) return null
  const iv = guardSignal.initialValue.trim()
  if (iv !== 'null' && iv !== "''" && iv !== '""' && iv !== '0' && iv !== 'false') {
    return null
  }

  // The returned identifier must be a module-scope constant
  const constant = ctx.state.localConstants.find(
    c => c.name === returnedConst && c.origin?.scope === 'module',
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
 * (#1897 PostList) Compute the SSR value of an object-returning block-body
 * memo derived from `searchParams()`:
 *   () => { const sp = searchParams(); return { sort: asSortKey(sp.get('sort')),
 *                                               tag: sp.get('tag') ?? '' } }
 * Emits a Go `map[string]interface{}{ "Sort": …, "Tag": … }` whose values are
 * lowered from the request query (see `lowerCtorExpr`). Keys are capitalized to
 * match the template's `.Params.<Field>` map access. Returns null for any shape
 * the lowerer can't represent, so the caller falls back to a nil map.
 */
export function computeObjectMemoInitialValue(
  ctx: GoEmitContext,
  memo: { parsedBlock?: ParsedStatement[]; parsedBlockComplete?: boolean },
): string | null {
  // Read the analyzer-carried block statements instead of re-parsing the
  // `computation` source with `ts.createSourceFile` (#2006). An incomplete
  // block (`parsedBlockComplete === false`) means a statement was omitted from
  // the tolerant parse — it could hide control flow this resolver can't model,
  // so bail to the nil fallback exactly as the former bail-on-unknown-statement
  // walk did.
  if (!memo.parsedBlock || !memo.parsedBlockComplete) return null

  // Accept only a strict shape: zero or more `const`/`let` declarations
  // followed by exactly one `return { … }` as the LAST statement. Any other
  // statement kind — `if`, an early/extra `return` — means the block has
  // control flow this resolver can't reason about, so we bail to the nil
  // fallback rather than silently lowering one of several returns (#1941
  // review). Along the way, collect `const <v> = searchParams()` bindings
  // (the env for `<v>.get('k')`).
  const searchParamsVars = new Set<string>()
  let retObj: Extract<ParsedExpr, { kind: 'object-literal' }> | null = null
  const statements = memo.parsedBlock
  for (let i = 0; i < statements.length; i++) {
    const s = statements[i]
    if (s.kind === 'var-decl') {
      // `const <v> = searchParams()` — a zero-arg call to a searchParams
      // local. Any other var-decl (a non-searchParams binding) is accepted
      // and ignored, matching the old code that accepted any const.
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
    // Bail on a shorthand property (`return { tag }`). The former walk only
    // accepted `ts.PropertyAssignment` and bailed on `ShorthandPropertyAssignment`;
    // preserve that strictness so this stays byte-identical (a shorthand value
    // is a bare identifier whose name need not match a `.Params.<Field>`
    // accessor, and lowering it would silently widen the accepted shape).
    if (prop.shorthand) return null
    // The key must be identifier- or string-named (a numeric key has no
    // matching `.Params.<Field>` accessor), matching the old
    // `ts.isIdentifier || ts.isStringLiteral` check.
    if (prop.keyKind !== undefined && prop.keyKind !== 'identifier' && prop.keyKind !== 'string') {
      return null
    }
    const go = lowerCtorExpr(ctx, parsedExprToParsedExpr2(prop.value), env)
    if (go === null) return null
    entries.push(`"${capitalizeFieldName(prop.key)}": ${go}`)
  }
  return `map[string]interface{}{\n\t\t${entries.join(',\n\t\t')},\n\t}`
}
