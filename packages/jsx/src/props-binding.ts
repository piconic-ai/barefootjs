import ts from 'typescript'
import type { ParamInfo } from './types.ts'

/**
 * Authoritative IdentifierName classification for a destructure-pattern
 * property key, built on TS's own `isIdentifierStart` / `isIdentifierPart`
 * primitives (Unicode-aware, stays aligned with what TS itself accepts as
 * a bare property key). Mirrors the `isIdent` precedent in
 * `jsx-to-ir.ts` (#1244) — a source key like `data-key` or `aria-label`
 * can't be emitted as a bare `key: local` destructure and must be quoted
 * (`"data-key": local`).
 */
export function isIdentifierName(key: string): boolean {
  if (key.length === 0) return false
  for (let i = 0; i < key.length; ) {
    const cp = key.codePointAt(i)!
    const ok = i === 0
      ? ts.isIdentifierStart(cp, ts.ScriptTarget.Latest)
      : ts.isIdentifierPart(cp, ts.ScriptTarget.Latest)
    if (!ok) return false
    i += cp > 0xFFFF ? 2 : 1
  }
  return true
}

/**
 * The single destructure-binding renderer for a props param, shared by
 * every JSX-runtime SSR adapter (Hono, TestAdapter). The caller-facing
 * key is `sourceName ?? name` (ParamInfo's own rule) — `name` is only
 * ever the LOCAL binding. Emits the plain shorthand when they match
 * (byte-identical to the pre-rename-aware form); emits a `key: local`
 * rename otherwise (b4f5075). This also covers the `class` → `className`
 * rename: a source prop literally named `class` can only reach
 * `propsParams` via an aliased destructure (`{ class: className }` —
 * `class` is a reserved word, so it can never be an un-aliased binding),
 * which sets `sourceName: 'class'` and takes the rename branch
 * (`class: className`), not a bare `className`.
 *
 * One exported implementation, two consumers, zero drift — the
 * hono/test-adapter pair carrying private copies is exactly the
 * lockstep-rule duplication #2460/#2524 were about.
 */
export function propsDestructureBinding(p: ParamInfo): string {
  const callerKey = p.sourceName ?? p.name
  const localName = p.name
  const binding = callerKey === localName
    ? localName
    : `${isIdentifierName(callerKey) ? callerKey : JSON.stringify(callerKey)}: ${localName}`
  return p.defaultValue ? `${binding} = ${p.defaultValue}` : binding
}

/**
 * Local-name → caller-facing-key map for prop-reference rewrites —
 * entries only for `ParamInfo`s that actually rename (`sourceName` set,
 * see its docstring in `types.ts`). `_p` is always keyed by the
 * caller-facing name (#2524 CSR half); an un-aliased prop leaves no
 * entry, so `map?.get(name) ?? name` degrades to an identity there.
 * Returns `undefined` when nothing renames, so callers can
 * short-circuit.
 */
export function buildPropAliasMap(params: readonly ParamInfo[]): Map<string, string> | undefined {
  let map: Map<string, string> | undefined
  for (const p of params) {
    if (p.sourceName) {
      if (!map) map = new Map()
      map.set(p.name, p.sourceName)
    }
  }
  return map
}

/**
 * The props-parameter shape needed to answer "is `name` an actual local
 * binding introduced by the props parameter" — as opposed to
 * `ctx.patterns.props`, which for a whole `(props: Props)` parameter holds
 * every TYPE-MEMBER name (`extractPropsFromTypeMembers`) for regex prop-
 * access matching, not real bindings.
 */
export interface PropsParamBindings {
  propsParams: readonly ParamInfo[]
  propsObjectName: string | null
}

/**
 * Local names actually bound by the props parameter. Empty for a whole
 * `(props: Props)` parameter: `propsParams` there is type-member names
 * (nothing local to shadow with), and `props` itself is `propsObjectName`,
 * checked separately by callers.
 */
export function boundPropLocalNames(b: PropsParamBindings): ReadonlySet<string> {
  if (b.propsObjectName !== null) return EMPTY_SET
  return new Set(b.propsParams.filter(p => !p.isRest).map(p => p.name))
}

const EMPTY_SET: ReadonlySet<string> = new Set()

/**
 * The two component bindings that forward the caller's leftover props:
 * the destructured `...rest` binding and a whole undestructured `(props)`
 * parameter. Both phases carry these names — the analyzer context in
 * Phase 1, the client-JS context in Phase 2 — so the resolver below takes
 * them as data rather than binding to either context type.
 */
export interface RestSpreadBindings {
  restPropsName: string | null
  propsObjectName: string | null
}

/**
 * Walks a bare `const x__alias = <name>` hop chain recorded in
 * `constantValues` (name → initializer text) until `terminal` recognizes
 * the current name, returning what it recognized. `null` when the chain
 * runs out (a constant whose value isn't a bare identifier — a real
 * computed object — stops the walk) or degenerates into a cycle.
 *
 * The one alias-hop walker in the compiler, shared by every caller that
 * needs "does this name ultimately reach some fixed binding" rather than
 * a bespoke copy per caller — `resolveRestSpreadOriginCore` below,
 * `resolveGetterAliases` (`csr-substitute.ts`, #2778), and
 * `isArrayExprDirectPropRef` (`jsx-to-ir.ts`, #2724, called directly rather
 * than through a `*Core`-style wrapper) are its callers, differing only in
 * what `terminal` recognizes as a hit — and, for `isArrayExprDirectPropRef`,
 * in also narrowing `constantValues` itself (`propAliasHopCandidates`)
 * before passing it in. `terminal` is checked BEFORE the constant-value
 * lookup so a name that is itself a target take priority over any
 * same-named local shadowing it (preserves `resolveRestSpreadOriginCore`'s
 * original hop order) — a caller whose `terminal` can itself be fooled by a
 * shadowed name (e.g. a scope-unaware lookup keyed only by name) must guard
 * that inside `terminal`, since this walker has no scope/binding awareness
 * of its own to do it centrally.
 *
 * `visited` guards a constant cycle (`const a = b; const b = a`); walking
 * hop by hop (not a precomputed set) is what lets a multi-hop alias
 * (`const p2 = props; const p3 = p2`) resolve through every link.
 */
export function resolveAliasOrigin<T>(
  constantValues: ReadonlyMap<string, string | undefined>,
  name: string,
  terminal: (name: string) => T | null,
): T | null {
  const visited = new Set<string>()
  let current: string | undefined = name.trim()
  while (current !== undefined && !visited.has(current)) {
    const hit = terminal(current)
    if (hit !== null) return hit
    visited.add(current)
    current = constantValues.get(current)?.trim()
  }
  return null
}

/**
 * Which of `bindings` the name `name` ultimately reaches. `'rest'` for the
 * destructured rest binding, `'props'` for the whole props object, `null`
 * for anything else.
 *
 * The single definition of "this `{...spread}` forwards the caller's
 * leftover props", shared by the two phases that must agree on it: Phase 1
 * decides whether the host element gets a slot id (#2754 — without one the
 * spread has no client-side patch point at all, so a pure CSR mount drops
 * every caller-supplied attribute), and Phase 2 decides whether to route
 * the spread to `applyRestAttrs` and filter it out of the template's
 * `spreadAttrs({...})` merge. Two copies of the rule would let an element
 * qualify for one and not the other, which is exactly the silent-drop
 * shape #2754 reports.
 */
export function resolveRestSpreadOriginCore(
  bindings: RestSpreadBindings,
  constantValues: ReadonlyMap<string, string | undefined>,
  name: string,
): 'rest' | 'props' | null {
  return resolveAliasOrigin(constantValues, name, (current) => {
    if (bindings.restPropsName && current === bindings.restPropsName) return 'rest'
    if (bindings.propsObjectName && current === bindings.propsObjectName) return 'props'
    return null
  })
}
