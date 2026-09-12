/**
 * Live-read rewrite for destructured props.
 *
 * A destructured name can appear bare in a dozen raw-captured text shapes
 * (effect bodies, memo computations, signal initials, handler bodies,
 * `mapArray` row bodies, conditional thunks, …), so rewriting it per
 * emitter would mean N places to keep in sync; the single door is the
 * joined init body, same precedent as `rewritePropsObjectRef`
 * (`rewrite-props-object.ts`) one step earlier in the same pipeline.
 *
 * Two shapes reach this door, dispatched on `ctx.propsObjectName`:
 *
 *   - PARAMETER destructuring (`function Child({ value })`,
 *     `propsObjectName === null`) — `rewriteParamDestructuredReads`, Move
 *     B's original mechanism (#2932).
 *   - a BODY destructure or bare-member alias off the whole props object
 *     (`function Child(props) { const { value } = props; ... }`,
 *     `propsObjectName` set) — `rewriteBodyAliasReads` (#2934). Move B left
 *     this branch a no-op: `rewritePropsObjectRef` (the pass immediately
 *     before this one) already turns `props.value` into `_p.value`
 *     wherever the SOURCE wrote it as a member access, but a body
 *     destructure's downstream USES are bare identifiers (`value`, not
 *     `props.value`), which that rename never touches — they stayed
 *     captured at the local's ONE declaration-time read forever.
 */

import ts from 'typescript'
import type { PropUsage } from '../types.ts'
import { computePropsUsedAsConditions } from './compute-prop-usage.ts'
import { boundPropLocalNames, livePropReadExpr, resolveBodyPropAliases, type LivePropReadInfo } from '../props-binding.ts'
import { parsePropReadInitializer } from './prune-unused-prop-extractions.ts'
import { rewriteScopedValueRefs } from '../prop-rewrite.ts'
import { identifierPattern } from '../identifier-pattern.ts'
import { PROPS_PARAM } from './utils.ts'
import type { ClientJsContext } from './types.ts'

export function rewriteDestructuredPropReads(
  code: string,
  ctx: ClientJsContext,
  propUsage: ReadonlyMap<string, PropUsage>,
): string {
  return ctx.propsObjectName === null
    ? rewriteParamDestructuredReads(code, ctx, propUsage)
    : rewriteBodyAliasReads(code, ctx)
}

/**
 * Rewrite every bare value-position read of a PARAMETER-destructured prop in
 * `code` (the joined `init*` body, already past `rewritePropsObjectRef`) to a
 * live `_p.<key>` read.
 *
 * The walk is `rewriteScopedValueRefs` (`prop-rewrite.ts`), which carries a
 * binding-scope stack, so `items.map((title) => title.a)` and a
 * handler-local `const title = 'local'` keep their own binding even when
 * `title` is also a prop name.
 *
 * Excluding `children`: reading `_p.children` live re-invokes a getter that
 * instantiates child components (see `emitPropsExtraction`) — `children`
 * must stay a captured-once read, by design.
 *
 * A null result can only mean `code` did not parse — never that a
 * substitution broke it, since the walk parses the pristine input and every
 * substituted string is a well-formed expression spliced where the walk
 * already proved an identifier sat. The one shape that trips it is a
 * tracked pre-existing hole (`map-body-no-silent-divergence.test.ts`'s
 * `KNOWN_HOLES`): a `.map()` preamble leaking raw JSX, which is already a
 * browser `SyntaxError` with or without this rewrite. Warning and passing
 * the code through keeps that a tracked silent hole instead of promoting it
 * to a compiler crash — same precedent as `pruneUnusedPropExtractions`.
 */
function rewriteParamDestructuredReads(
  code: string,
  ctx: ClientJsContext,
  propUsage: ReadonlyMap<string, PropUsage>,
): string {
  const names = new Set(boundPropLocalNames(ctx))
  names.delete('children')
  if (names.size === 0) return code

  const propsUsedAsConditions = computePropsUsedAsConditions(ctx, names)
  const propByName = new Map<string, LivePropReadInfo>()
  for (const p of ctx.propsParams) propByName.set(p.name, p)

  const replacementFor = (name: string): string => {
    // `names` comes from `ctx.propsParams`, so the fallback is unreachable —
    // kept over a non-null assertion.
    const prop = propByName.get(name)
    if (!prop) return `${PROPS_PARAM}.${name}`
    return livePropReadExpr(prop, propUsage.get(name), propsUsedAsConditions.has(name))
  }

  const result = rewriteScopedValueRefs(code, names, replacementFor, { allowStatements: true })
  if (result === null) {
    console.warn(
      `[barefootjs] rewriteDestructuredPropReads: the generated init body for ` +
        `component "${ctx.componentName}" did not parse as JS/TSX (most likely a ` +
        `pre-existing raw-JSX leak — see this function's docstring); skipping the ` +
        `live-prop-read rewrite for it.`,
    )
    return code
  }
  return result
}

/**
 * Rewrite every bare value-position read of a BODY-destructured (or
 * bare-member-alias) prop local in `code` to a live `_p.<key>` read, for a
 * bare-props-form component (`function Foo(props: Props)`).
 *
 * `resolveBodyPropAliases` can't distinguish `const { value } = props` from
 * `const value = props.value` (the analyzer's IR is identical for both —
 * see its docstring), so this rewrite treats them identically too. That's
 * the correct call, not a shortcut: BOTH are pure single-prop passthroughs
 * with no computation of their own, so both should read live, matching
 * `props.value` used directly (which already reads live via
 * `rewritePropsObjectRef`).
 *
 * A body alias's declaration is a REAL statement in `code` (unlike a
 * parameter-destructured name, which never had one) — `const value =
 * _p.value;`, physically sitting in the init body. Left in place, it would
 * shadow every reference the rewrite is trying to make live (the walk sees
 * it as a `Block`-scope declaration and treats every use as already
 * correctly bound, exactly as it should for a genuine local). So this pass
 * locates and DELETES each qualifying declaration BEFORE walking, rather
 * than relying on `pruneUnusedPropExtractions` (which runs after this pass
 * and only prunes an EXACT `const X = _p.X` shape — never a renamed alias's
 * `const v = _p.value`, since its bound name doesn't match the read key).
 *
 * Only a declaration whose initializer is *exactly* `_p.<key>` [`?? <d>`] is
 * touched — matched via `parsePropReadInitializer`, the same recognizer
 * `pruneUnusedPropExtractions` uses for its narrower same-name case. A local
 * this pass can't re-locate in that exact shape is left alone entirely
 * (conservative false-keep: it stays captured, i.e. today's behavior, never
 * a half-rewrite).
 *
 * Excluding `key === 'children'`: same hazard as the parameter form above,
 * keyed by the CALLER-FACING name (`const { children: kids } = props`
 * aliases `kids -> children` and must stay captured-once too).
 */
function rewriteBodyAliasReads(code: string, ctx: ClientJsContext): string {
  const aliases = resolveBodyPropAliases(ctx.localConstants, ctx.propsObjectName)
  for (const [local, alias] of aliases) {
    if (alias.key === 'children') aliases.delete(local)
  }
  if (aliases.size === 0) return code
  // Quick exit when none of the candidate local names appear at all.
  if (![...aliases.keys()].some((name) => identifierPattern(name).test(code))) return code

  const sourceFile = ts.createSourceFile('init-body.ts', code, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TS)

  const spans: Array<readonly [number, number]> = []
  const located = new Map<string, { key: string; defaultValue?: string; defaultContainsArrow?: boolean }>()
  for (const stmt of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(stmt) || !stmt.name?.text.startsWith('init') || !stmt.body) continue
    for (const inner of stmt.body.statements) {
      if (!ts.isVariableStatement(inner)) continue
      if ((inner.declarationList.flags & ts.NodeFlags.Const) === 0) continue
      const decls = inner.declarationList.declarations
      if (decls.length !== 1) continue
      const decl = decls[0]!
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      const alias = aliases.get(decl.name.text)
      if (!alias) continue
      const parsedInit = parsePropReadInitializer(decl.initializer)
      if (parsedInit === null || parsedInit.key !== alias.key) continue
      if ((parsedInit.fallback !== null) !== alias.hasDefault) continue
      located.set(decl.name.text, {
        key: alias.key,
        defaultValue: parsedInit.fallback?.getText(sourceFile),
        defaultContainsArrow: alias.defaultContainsArrow,
      })
      spans.push([inner.getFullStart(), inner.getEnd()])
    }
  }
  if (located.size === 0) return code

  // Delete the located declarations first (back-to-front) so the walk below
  // never sees them as a shadowing local binding.
  let stripped = code
  for (const [start, end] of [...spans].sort((a, b) => b[0] - a[0])) {
    stripped = stripped.slice(0, start) + stripped.slice(end)
  }

  const names = new Set(located.keys())
  const replacementFor = (name: string): string => {
    // `names` comes from `located`, so the fallback is unreachable — kept
    // over a non-null assertion.
    const info = located.get(name)
    if (!info) return `${PROPS_PARAM}.${name}`
    const prop: LivePropReadInfo = {
      name,
      sourceName: info.key,
      defaultValue: info.defaultValue,
      defaultContainsArrow: info.defaultContainsArrow,
    }
    return livePropReadExpr(prop, undefined, false)
  }

  const result = rewriteScopedValueRefs(stripped, names, replacementFor, { allowStatements: true })
  if (result === null) {
    console.warn(
      `[barefootjs] rewriteDestructuredPropReads: the generated init body for ` +
        `component "${ctx.componentName}" did not parse as JS/TSX after removing its ` +
        `body-destructured prop-alias declarations; skipping the live-prop-read ` +
        `rewrite for it.`,
    )
    return code
  }
  return result
}
