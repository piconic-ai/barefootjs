import ts from 'typescript'
import type { ConstantInfo, ParamInfo, PropUsage } from './types.ts'
import { propHasPropertyAccess } from './ir-to-client-js/compute-prop-usage.ts'
import { parsePropReadInitializer } from './ir-to-client-js/prune-unused-prop-extractions.ts'
import { PROPS_PARAM } from './ir-to-client-js/utils.ts'

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
 * Local-name → caller-facing-key map for a BARE-PROPS-form component
 * (`function Foo(props: Props)`) whose BODY destructures a prop under a
 * different local name (`const { children: kids } = props`) — the
 * body-level twin of `buildPropAliasMap` above, which only sees
 * PARAMETER-destructuring aliases (`{ n: count }`, tracked via
 * `ParamInfo.sourceName`). For the bare-props form, `propsParams` comes
 * from the TYPE annotation (`extractPropsFromTypeMembers`) and has no
 * notion of a body-level rename at all — but the analyzer already
 * resolves such a destructuring statement into an ordinary
 * `localConstants` entry whose `parsed` is a plain `props.<key>` member
 * read (`const { children: kids } = props` → a `kids` local const valued
 * `props.children`). Recognizing that shape here is enough to answer
 * "what caller-facing prop key does this local alias" without a second,
 * dedicated AST walk of the destructuring pattern itself (#2788).
 *
 * Returns an empty map for a parameter-destructuring component
 * (`propsObjectName === null`) — that shape's aliasing is already fully
 * covered by `buildPropAliasMap`.
 *
 * Passes `requireLiveRewriteSafe: false` to `resolveBodyPropAliases` — this
 * consumer only needs the local-name↔caller-key mapping to seed the SSR
 * stash under the local's name (#2788), which is sound regardless of
 * `const`/`let` or a later mutation: those two exclusions exist solely to
 * protect the LIVE client-JS rewrite (`rewriteBodyAliasReads`) from turning
 * a reassignment into a silent write-through to the caller's prop, a
 * concern this SSR-side, declaration-time alias mapping doesn't share. A
 * `let`-declared renamed body destructure (`let { children: kids } =
 * props`) is exactly as valid an alias for stash-seeding purposes as a
 * `const` one — inheriting the stricter filter here would silently drop
 * its stash entry and reintroduce #2788 for that one shape.
 */
export function resolveBodyDestructuredPropAliases(
  localConstants: readonly ConstantInfo[],
  propsObjectName: string | null,
): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const [local, alias] of resolveBodyPropAliases(localConstants, propsObjectName, { requireLiveRewriteSafe: false })) {
    if (!alias.hasDefault) aliases.set(local, alias.key)
  }
  return aliases
}

/**
 * A local `const`/`let` in a bare-props-form component (`function
 * Foo(props: Props)`) whose value is a PURE alias of a single caller-facing
 * prop — either a body destructure (`const { value } = props`, `const {
 * label = 'none' } = props`) or an equivalent bare member read (`const label
 * = props.label ?? 'fallback'`); the analyzer's IR can't distinguish the two
 * shapes (both parse to the same `ConstantInfo`), and neither can this
 * resolver — see `resolveBodyAliasReads`'s (`rewrite-destructured-props.ts`)
 * docstring for why that's the right call.
 */
export interface BodyPropAlias {
  /** Caller-facing prop key (`props.<key>`). */
  key: string
  /** Whether the value has a `?? <default>` (destructure default, or an
   *  explicit `props.x ?? d` alias) — `resolveBodyDestructuredPropAliases`
   *  excludes these; `resolveBodyAliasReads` handles them itself. */
  hasDefault: boolean
  /** When true, the default value contains an arrow function or function
   *  expression — mirrors `ParamInfo.defaultContainsArrow`. `hasDefault`'s
   *  own source text is NOT carried here (unlike `defaultContainsArrow`):
   *  `rewriteBodyAliasReads` re-derives it from the emitted init body's own
   *  declaration rather than from this alias (see its docstring), and the
   *  only OTHER consumer that once read a `defaultValue` field here — the
   *  `jsx-to-ir.ts` CSR-template overlay — is gone since #2943 folded the
   *  default straight onto `ParamInfo.defaultValue` at the analyzer level. */
  defaultContainsArrow?: boolean
}

/**
 * Local-name → alias-info map for every PURE prop-passthrough local in a
 * bare-props-form component — the superset `resolveBodyDestructuredPropAliases`
 * (defaultless only, for the SSR-stash use above) and `resolveBodyAliasReads`
 * (`rewrite-destructured-props.ts`, live-read rewrite including defaults)
 * both build on.
 *
 * Excludes:
 *   - `propsObjectName === null` (parameter-destructuring components — that
 *     shape's aliasing is fully covered by `buildPropAliasMap` instead).
 *   - `isModule` (module-scope constants aren't per-instance prop reads).
 *   - When `requireLiveRewriteSafe` is true (the default — the right
 *     setting for a caller that turns the alias into a LIVE `_p.X` read,
 *     e.g. `rewriteBodyAliasReads`), also excludes:
 *     - `let` bindings: a later reassignment (`value = 9`) would need to
 *       become `_p.value = 9`, silently writing through to the caller's
 *       prop instead of a local variable — never safe to infer.
 *     - `mutatedAfterDeclaration` (#2910's `markMutatedConstants`): once
 *       something mutates the binding in place after its declaration,
 *       `value` no longer tracks the live prop, and treating it as a
 *       passthrough alias would silently drop the mutation.
 *     A caller that only needs the declaration-time local↔caller-key
 *     mapping (e.g. `resolveBodyDestructuredPropAliases`, feeding the SSR
 *     stash seed) passes `requireLiveRewriteSafe: false` — a `let` local or
 *     one mutated later in the function body is still a perfectly valid
 *     alias AT its declaration, which is all an initial SSR-stash seed
 *     needs.
 */
export function resolveBodyPropAliases(
  localConstants: readonly ConstantInfo[],
  propsObjectName: string | null,
  options: { requireLiveRewriteSafe?: boolean } = {},
): Map<string, BodyPropAlias> {
  const { requireLiveRewriteSafe = true } = options
  const aliases = new Map<string, BodyPropAlias>()
  if (propsObjectName === null) return aliases
  for (const c of localConstants) {
    if (c.isModule || !c.value) continue
    if (requireLiveRewriteSafe && (c.declarationKind !== 'const' || c.mutatedAfterDeclaration)) continue
    // Re-parse `value` (rather than walking `c.parsed`) so the default's
    // SOURCE TEXT is available verbatim — `ParsedExpr` structures the
    // default but doesn't retain its original formatting, and this reuses
    // the one recognizer (`parsePropReadInitializer`) the emit-time passes
    // (`prune-unused-prop-extractions.ts`, `rewrite-destructured-props.ts`)
    // already share, rather than a third bespoke shape check. Wrapped in
    // parens so a bare object-literal-like value still parses as an
    // expression, matching `ConstantInfo.parsed`'s own convention.
    const sourceFile = ts.createSourceFile('__alias__.ts', `(${c.value.trim()});`, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS)
    const stmt = sourceFile.statements[0]
    if (!stmt || !ts.isExpressionStatement(stmt)) continue
    const node = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression
    const read = parsePropReadInitializer(node, propsObjectName)
    if (read === null) continue
    const hasDefault = read.fallback !== null
    aliases.set(c.name, {
      key: read.key,
      hasDefault,
      defaultContainsArrow: hasDefault ? c.containsArrow : undefined,
    })
  }
  return aliases
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
 * The subset of `ParamInfo` a live prop read actually needs. A body-level
 * pure-alias local (`resolveBodyPropAliases`) has no real `ParamInfo` — it
 * never bound a parameter — so callers synthesize one of these instead of a
 * full `ParamInfo` (which would need a fabricated `type`/`optional`).
 */
export type LivePropReadInfo = Pick<ParamInfo, 'name' | 'sourceName' | 'defaultValue' | 'defaultContainsArrow'>

/** `_p.<callerKey>` — `_p` is always keyed by the caller-facing name (#2524 CSR half). */
export function propReadBase(p: LivePropReadInfo): string {
  return `${PROPS_PARAM}.${p.sourceName ?? p.name}`
}

/**
 * The `??` right-hand side for a prop read, or null when the bare read is
 * correct. Precedence:
 *   1. an explicit destructure default (`{ x = 1 }`) — an arrow default gets
 *      an extra paren, since `??` binds tighter than the arrow head and
 *      `_p.onInput ?? () => {}` would be a syntax error.
 *   2. `usedAsLoopArray` → `[]`.
 *   3. property/index access → `{}`, UNLESS the prop also guards a
 *      conditional: `{}` is truthy, so that would always render the branch.
 *   4. otherwise null — a defaultless optional reads `undefined` when
 *      absent, which is what the JS binding did and what SSR produces. A
 *      synthesized zero default would diverge from SSR instead (`size ?? 1`
 *      seeds 1 server-side; a `_p.size ?? 0` read would hydrate to 0).
 */
export function propReadFallback(
  p: LivePropReadInfo,
  usage: PropUsage | undefined,
  usedAsCondition: boolean,
): string | null {
  if (p.defaultValue) return p.defaultContainsArrow ? `(${p.defaultValue})` : p.defaultValue
  if (usage?.usedAsLoopArray) return '[]'
  if (propHasPropertyAccess(usage) && !usedAsCondition) return '{}'
  return null
}

/**
 * The live read of a destructured prop inside init scope, in the same shape
 * props-object mode emits for `props.X`. The one formula every live-read
 * call site shares: the whole-init-body rewrite
 * (`rewriteDestructuredPropReads`), the reactive attribute rewrite
 * (`emit-reactive.ts`), the controlled-signal sync effect
 * (`build-declaration-emit.ts`), and the Phase-1 CSR `template:` rewrite
 * (`jsx-to-ir.ts`).
 *
 * Parenthesized whenever a fallback is present so it splices safely into an
 * arbitrary read position (a member access, a call argument, …).
 * `emitPropsExtraction` deliberately does NOT use this: its `children` line
 * must stay an unparenthesized `const X = _p.X [?? d]` for
 * `pruneUnusedPropExtractions`'s AST matcher, so it composes
 * `propReadBase`/`propReadFallback` itself.
 */
export function livePropReadExpr(
  p: LivePropReadInfo,
  usage: PropUsage | undefined,
  usedAsCondition: boolean,
): string {
  const base = propReadBase(p)
  const fallback = propReadFallback(p, usage, usedAsCondition)
  return fallback === null ? base : `(${base} ?? ${fallback})`
}

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
