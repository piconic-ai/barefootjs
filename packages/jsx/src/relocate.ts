/**
 * Single rewrite contract for cross-stage expression relocation (#1138).
 *
 * Replaces `prop-rewrite.ts` + scattered inline judgment in
 * `compute-inlinability.ts` / `html-template.ts`. relocate() is the
 * canonical answer to: "given an expression authored in fromScope,
 * what text should be emitted at toScope?"
 *
 * See `tmp/staged-ir-design.md` (or `spec/compiler.md` after P7) for
 * the full design rationale and decision matrix.
 */

import ts from 'typescript'
import type { Scope, BindingKind, IRMetadata } from './types.ts'
import { isVisibleIn } from './types.ts'
import type { AnalyzerContext } from './analyzer-context.ts'
import { PROPS_PARAM } from './ir-to-client-js/utils.ts'
import type {
  TemplatePrimitiveRegistry,
  TemplateCallAcceptor,
} from './adapters/interface.ts'
import { tsNodeToParsedExpr, type ParsedExpr } from './expression-parser.ts'
import { prepareLoweringMatchers, type LoweringMatcher } from './lowering-registry.ts'

export interface RelocateEnv {
  /**
   * Identifiers visible in the authoring scope, with their resolved
   * binding kind. Built once per component by the analyzer; carries
   * shadow precedence (the last declaration in source order wins,
   * mirroring today's analyzer.ts:1780–1797 logic).
   */
  bindings: Map<string, BindingKind>
  /**
   * Inline-eligible constants. Maps name → initializer text. A name is
   * eligible iff its initializer is pure and its free refs are all
   * visible at toScope (the recursive-visibility check in §2.3).
   */
  inlinable: Map<string, string>
  /**
   * Set of names that map to `_p.X` rewrites (props that survived the
   * shadow guard). Equivalent to today's
   * `TransformContext._destructuredPropNames`.
   */
  propsForLift: Set<string>
  /**
   * Name of the props parameter (e.g. `props`). Used to detect
   * `props.X` member access at lift sites — those are not free refs
   * to rewrite, but the property access *target* (`X`) might be.
   */
  propsObjectName: string | null
  /** When true, unreachable refs are replaced with `undefined` / `[]`. */
  allowFallback: boolean
  /**
   * Adapter-supplied list of pure JS callees that can be safely rendered in
   * template scope. When a call's callee is in this map, the inline-safety
   * checks below (`hasCallWithBridgedArg`, `hasZeroArgCall`) treat that call
   * as accepted instead of rejecting it. The emit function itself isn't
   * called from relocate — the substitution happens later in adapter render.
   *
   * Empty / undefined behaves identically to pre-#1187: every call is
   * subject to the bridged-arg / zero-arg shape rejections.
   */
  templatePrimitives?: TemplatePrimitiveRegistry
  /**
   * Broad-acceptance predicate for adapters whose template runtime is a
   * full JS engine (Hono SSR, future CSR). Consulted when a callee isn't
   * in `templatePrimitives`. Returning true marks the call as accepted.
   */
  acceptsTemplateCall?: TemplateCallAcceptor
  /**
   * Lowering-registry matchers (#2057) bound to this component's metadata
   * (`prepareLoweringMatchers`), consulted by `isCallAcceptedByAdapter` as a
   * third acceptance path alongside `templatePrimitives` /
   * `acceptsTemplateCall`. A call recognised by ANY matcher (returns a
   * non-null `LoweringNode`) is treated as adapter-accepted — the matcher
   * result itself isn't used here (relocate only needs a boolean; the
   * adapter's own render pass re-runs the matcher to get the node). Bound
   * once per component (`buildRelocateEnvFromIR`), so checking it per call
   * site is cheap. Undefined/empty behaves like pre-#2069 (no matcher path).
   */
  loweringMatchers?: readonly LoweringMatcher[]
  /**
   * One-hop alias resolution table (#2069 R2): name → the bare identifier
   * or dotted identifier-path text of its initializer, for local constants
   * whose value is itself just another identifier/path reference
   * (`const fmt = customSerialize`, `const f = Math.floor`) — NOT a call,
   * object, or any other expression shape. `isCallAcceptedByAdapter` uses
   * this to resolve a call's callee ONE hop before keying
   * `templatePrimitives` / dispatching matchers, so a locally-aliased
   * import or global still resolves to a registrable name. Deliberately
   * shallow — an alias-to-alias chain (`const g = f` where `f` is itself
   * an alias) is NOT resolved transitively; the shadow guard naturally
   * rejects it because the one-hop target's own binding kind is
   * `init-local`/`module-local` with no further resolution.
   */
  aliasTargets?: ReadonlyMap<string, string>
}

export interface RelocateResult {
  /** Rewritten expression text, ready to interpolate into toScope. */
  text: string
  /** True when relocation succeeded without falling back. */
  ok: boolean
  /**
   * Identifiers the *rewritten* text references (post-rewrite). emit
   * uses this to gate import preservation and detect needed module
   * names. Inlined constants contribute their own free refs here.
   */
  usedExternals: Set<string>
  /** Per-name decisions, for diagnostics and P5 error emission. */
  decisions: RelocateDecision[]
}

export interface RelocateDecision {
  name: string
  kind: BindingKind
  action: 'pass-through' | 'lift-to-prop' | 'inline' | 'fallback' | 'reject'
  /** Final emitted form for this name. */
  rewrittenAs: string
}

/**
 * Build a binding kind for a free identifier given the authoring env.
 * Falls back to 'global' when the analyzer didn't track the name.
 */
function classify(name: string, env: RelocateEnv): BindingKind {
  return env.bindings.get(name) ?? 'global'
}

/**
 * Walks the AST to find which free identifiers actually need rewriting,
 * skipping property names, shorthand keys, and identifiers used as
 * the right side of a member expression (which are property names, not
 * free refs).
 */
function collectFreeRefs(node: ts.Node): Map<string, ts.Identifier[]> {
  const refs = new Map<string, ts.Identifier[]>()
  function visit(n: ts.Node, parent?: ts.Node): void {
    if (ts.isIdentifier(n)) {
      // Skip: foo.X — X is a property name
      if (parent && ts.isPropertyAccessExpression(parent) && parent.name === n) return
      // Skip: { X: ... } — X is a key
      if (parent && ts.isPropertyAssignment(parent) && parent.name === n) return
      // Skip: { X } — shorthand key (the value side IS a ref though)
      if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === n) return
      const list = refs.get(n.text) ?? []
      list.push(n)
      refs.set(n.text, list)
      return
    }
    ts.forEachChild(n, child => visit(child, n))
  }
  visit(node)
  return refs
}

/**
 * Decide the action for a single free reference based on the
 * (fromScope, toScope, kind) tuple. Mirrors the §2.2 decision matrix.
 */
function decideAction(
  kind: BindingKind,
  toScope: Scope,
  env: RelocateEnv,
  name: string,
): { action: RelocateDecision['action']; rewrittenAs: string } {
  // Reachable as bare identifier in the destination scope.
  if (isVisibleIn(toScope, kind)) {
    return { action: 'pass-through', rewrittenAs: name }
  }

  // Not reachable bare. Decide how to bridge:
  if (kind === 'prop' && toScope === 'template') {
    // The props *object* itself (e.g. bare `props` in `makeStore(props)`)
    // lifts to the whole `_p` parameter. Lifting to `_p.props` would be a
    // non-existent property: the template lambda receives `_p` directly,
    // not an object that wraps it. Destructured prop names (`config`,
    // `name`, etc.) keep the per-key `_p.name` form.
    if (env.propsObjectName !== null && name === env.propsObjectName) {
      return { action: 'lift-to-prop', rewrittenAs: PROPS_PARAM }
    }
    // Lift `name` → `_p.name`.
    return { action: 'lift-to-prop', rewrittenAs: `${PROPS_PARAM}.${name}` }
  }

  if ((kind === 'init-local' || kind === 'sub-init-local') && toScope === 'template') {
    // One-hop alias resolution (#2069 R2): `const fmt = customSerialize`
    // is a pure identifier/path alias — its bare reference is
    // interchangeable with the target text (checked BEFORE `env.inlinable`,
    // which isn't populated yet when this runs from inside
    // `computeInlinability`'s own Stage-1 classification loop; the alias
    // table is built once at env-construction time so it's always ready).
    // This resolves the CALLEE identifier itself (`fmt` → `customSerialize`
    // wherever it's referenced) — a separate concern from
    // `isCallAcceptedByAdapter`'s own one-hop resolution, which only
    // decides whether a *call* is safe to inline, not how its callee text
    // renders.
    //
    // Only substitute when the alias TARGET's own leftmost identifier is
    // itself bare-visible at `toScope` (module-import / module-local /
    // global) — this is what keeps the resolution to exactly one hop: an
    // alias-of-an-alias (`const g = f` where `f` is itself just another
    // local) has a target whose kind is `init-local`, which fails the
    // visibility check below, so `g` falls through to the normal
    // `env.inlinable` / fallback path instead of being blindly rewritten
    // to the still-unreachable `f`.
    const aliasTarget = env.aliasTargets?.get(name)
    if (aliasTarget !== undefined) {
      const targetLeftmost = aliasTarget.includes('.') ? aliasTarget.split('.')[0]! : aliasTarget
      const targetKind = classify(targetLeftmost, env)
      if (isVisibleIn(toScope, targetKind)) {
        return { action: 'inline', rewrittenAs: aliasTarget }
      }
    }
    // Try inline; fall back if not eligible.
    const inlineForm = env.inlinable.get(name)
    if (inlineForm !== undefined) {
      return { action: 'inline', rewrittenAs: inlineForm }
    }
    if (env.allowFallback) {
      return { action: 'fallback', rewrittenAs: 'undefined' }
    }
    return { action: 'reject', rewrittenAs: name }
  }

  if (
    (kind === 'signal-getter' ||
      kind === 'signal-setter' ||
      kind === 'memo-getter' ||
      kind === 'render-item') &&
    toScope === 'template'
  ) {
    // Reactive bindings have no value at template-evaluation time.
    if (env.allowFallback) {
      return { action: 'fallback', rewrittenAs: 'undefined' }
    }
    return { action: 'reject', rewrittenAs: name }
  }

  // Catch-all: visible-in returned false but we have no specialized
  // bridge. Fall back if allowed, else reject.
  if (env.allowFallback) {
    return { action: 'fallback', rewrittenAs: 'undefined' }
  }
  return { action: 'reject', rewrittenAs: name }
}

/**
 * Apply all per-name rewrites to the source text. Uses targeted
 * substitution (word-boundary regex) keyed by names that are AST-
 * confirmed free references. Pass-through decisions are skipped.
 */
function applyRewrites(
  text: string,
  decisions: RelocateDecision[],
): string {
  let result = text
  for (const d of decisions) {
    if (d.action === 'pass-through' || d.rewrittenAs === d.name) continue
    // Word-boundary match. Same lookbehind/lookahead rules as the
    // legacy prop-rewrite to avoid hitting object-literal keys and
    // member-access targets.
    const pattern = new RegExp(
      `(?<!${PROPS_PARAM}\\.)(?<!['"\\w.-])\\b${d.name}\\b(?![a-zA-Z0-9_$])`,
      'g',
    )
    result = result.replace(pattern, (match, offset, str) => {
      // Skip object literal keys: `{ name: ... }`
      const after = str.slice(offset + match.length)
      if (/^\s*:(?!:)/.test(after)) {
        const before = str.slice(0, offset)
        if (/[{,]\s*$/.test(before)) return match
      }
      return d.rewrittenAs
    })
  }
  return result
}

/**
 * Relocate an expression authored at `fromScope` for emission at
 * `toScope` against the binding environment `env`. Returns the
 * rewritten text plus per-name decisions for diagnostics.
 *
 * When `fromScope === toScope`, the decision for every reference is
 * `pass-through` and the result text is identical to input.
 */
export function relocate(
  expr: string,
  exprNode: ts.Node | null,
  fromScope: Scope,
  toScope: Scope,
  env: RelocateEnv,
): RelocateResult {
  // Same-scope: no rewriting needed. Still collect references for
  // emit-side import-preservation diagnostics.
  if (fromScope === toScope) {
    return { text: expr, ok: true, usedExternals: new Set(), decisions: [] }
  }

  // Identify free references. Prefer AST when available (precise);
  // fall back to a name-by-name word-boundary scan against `bindings`.
  const refs = exprNode
    ? collectFreeRefs(exprNode)
    : scanRefsByName(expr, env.bindings)

  const decisions: RelocateDecision[] = []
  const usedExternals = new Set<string>()
  let ok = true

  for (const [name] of refs) {
    const kind = classify(name, env)
    const { action, rewrittenAs } = decideAction(kind, toScope, env, name)
    decisions.push({ name, kind, action, rewrittenAs })
    if (action === 'reject') ok = false
    // Track post-rewrite identifiers for import preservation.
    if (action === 'pass-through' && (kind === 'module-import' || kind === 'module-local' || kind === 'global')) {
      usedExternals.add(name)
    }
    if (action === 'inline') {
      // Inlined initializer may pull in module-imports; conservatively
      // treat all bare identifiers in the inline form as externals.
      for (const ext of bareIdentifiers(rewrittenAs)) usedExternals.add(ext)
    }
  }

  const text = applyRewrites(expr, decisions)
  return { text, ok, usedExternals, decisions }
}

// =============================================================================
// Inline-safety classification
// =============================================================================

/**
 * Decide whether `value` (an `init`-scope expression) can be safely
 * duplicated into `template` scope as a literal substitution.
 *
 * "Safe" requires two conditions:
 *
 *   1. `relocate(value, ..., 'init', 'template', env).ok` is true. This
 *      catches references that can't be bridged at all (init-locals
 *      with no inline form, signal/memo getters, etc.).
 *
 *   2. No call expression in the value has a lifted reference inside
 *      its argument list. A call like `useYjs(_p.roomId, _p.readOnly)`
 *      would otherwise inline into the template lambda body and run
 *      on every template re-render — calling external helpers per
 *      render breaks identity (each call is a fresh result) and, when
 *      the helper has side effects, creates duplicate resources.
 *      `useContext(BarChartContext)` — args are static (a module-local
 *      `createContext()` value, no lift) — stays inline-safe and
 *      preserves the #1100 protected behavior.
 *
 * Returns `{ ok, rewrittenValue }`. When `ok` is true, `rewrittenValue`
 * is the value with all bridges applied (e.g. `props.X` → `_p.X`) and
 * is what should land in the inline map.
 */
export function isInlinableInTemplate(
  value: string,
  env: RelocateEnv,
): { ok: boolean; rewrittenValue: string; decisions: RelocateDecision[] } {
  const valueNode = parseExpressionNode(value)
  const r = relocate(value, valueNode, 'init', 'template', env)
  if (!r.ok) return { ok: false, rewrittenValue: r.text, decisions: r.decisions }

  if (valueNode) {
    if (hasCallWithBridgedArg(valueNode, r.decisions, env)) {
      return { ok: false, rewrittenValue: r.text, decisions: r.decisions }
    }
    if (hasZeroArgCall(valueNode, env)) {
      // Zero-arg calls (`readItems()`, `count()`) read runtime state.
      // Inlining them runs the call at template-eval time when the
      // surrounding scope (init body) hasn't yet provided whatever the
      // call expects. The pre-staged-IR pipeline rejected this via
      // `/\b\w+\(\)/` regex; mirror it here as a structural check so
      // the long-standing `${[].map(...)}` fallback for cases like
      // `const items = readItems()` keeps producing a stable empty
      // initial render and lets init's effect populate the real value.
      //
      // Calls whose callee is registered as a template primitive (#1187)
      // bypass this rejection — the adapter has promised it can render
      // the call at template scope safely.
      return { ok: false, rewrittenValue: r.text, decisions: r.decisions }
    }
  }

  return { ok: true, rewrittenValue: r.text, decisions: r.decisions }
}

/**
 * Resolve the textual identifier path of a call's callee — `JSON.stringify`,
 * `Math.floor`, `String`, `obj.method`. Returns null when the callee shape
 * isn't a plain identifier or property-access chain (e.g. `(cond ? a : b)()`,
 * computed access `obj['method']()`). Keeps the registry lookup deterministic.
 *
 * Note: this resolves the *textual* path only. It does not know whether
 * `obj` is a value of a particular TypeScript type, so method calls on
 * arbitrary receivers (`props.name.toUpperCase()`) cannot be matched
 * against type-anchored registry keys like `String.prototype.toUpperCase`.
 * This remains out of scope in V2 (#1187 R1) — users fall back to
 * `/* @client *\/` for those cases.
 *
 * V2 (#2069): the registry is still identifier-path-only, but two things
 * widen it beyond the raw path this function returns:
 *   1. One-hop alias resolution (`isCallAcceptedByAdapter`) — a callee whose
 *      leftmost identifier is a local const aliasing another identifier/path
 *      (`const fmt = customSerialize`) resolves through that one hop before
 *      the path returned here is keyed against `templatePrimitives`.
 *   2. A THIRD acceptance path alongside `templatePrimitives` /
 *      `acceptsTemplateCall`: `RelocateEnv.loweringMatchers` (#2057). A
 *      user-imported helper is never added to the string-keyed registry —
 *      it's recognised structurally by a `LoweringPlugin` (import-aware via
 *      `prepare(metadata)`), which accepts calls this function's textual
 *      path can't key at all (the plugin matches on the parsed callee/args
 *      shape, not a string).
 */
function getCalleeIdentifierPath(callee: ts.Expression): string | null {
  // Unwrap `(expr)` — `csrSubstitute`'s AST splicer wraps every identifier
  // substitution in parens (`(customSerialize)(x)` after a one-hop alias
  // resolves `fmt` → `customSerialize`), so a callee that started as a bare
  // identifier can arrive here re-parsed as a `ParenthesizedExpression`.
  // Unwrapping is always safe: a paren never changes *which* identifier
  // path a callee resolves to, only re-parse shape.
  if (ts.isParenthesizedExpression(callee)) return getCalleeIdentifierPath(callee.expression)
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) {
    const left = getCalleeIdentifierPath(callee.expression)
    if (left === null) return null
    return `${left}.${callee.name.text}`
  }
  return null
}

/**
 * Walk to the leftmost identifier of a callee path. For `JSON.stringify`
 * returns `JSON`, for `obj.method.deeper` returns `obj`, for a bare
 * `foo()` returns `foo`. Used by `isCallAcceptedByAdapter` to decide
 * whether the callee is a *truly* global / imported name vs a local
 * binding that happens to share its name with a registered primitive
 * (the shadowing case — the registry must not fire then).
 */
function getCalleeLeftmostIdentifier(callee: ts.Expression): string | null {
  if (ts.isParenthesizedExpression(callee)) return getCalleeLeftmostIdentifier(callee.expression)
  if (ts.isIdentifier(callee)) return callee.text
  if (ts.isPropertyAccessExpression(callee)) {
    return getCalleeLeftmostIdentifier(callee.expression)
  }
  return null
}

/**
 * Binding kinds whose names safely escape component-scope shadowing —
 * the registry can apply when the callee's leftmost identifier resolves
 * to one of these. Local-ish kinds (`prop`, `signal-*`, `init-local`,
 * etc.) are explicitly excluded: a local const named `JSON` shadows the
 * global, so `JSON.stringify` in that scope must not be accepted just
 * because the registry has a `JSON.stringify` entry.
 */
const REGISTRY_SAFE_BINDING_KINDS: ReadonlySet<BindingKind> = new Set([
  'global',
  'module-import',
  'module-local',
])

/**
 * Whether `env`'s adapter promises it can render this call in template
 * scope. Three independent acceptance paths, any of which is sufficient:
 *
 *   1. `templatePrimitives` — string-keyed identifier-path registry
 *      (`JSON.stringify`, `Math.floor`).
 *   2. `acceptsTemplateCall` — broad predicate for full-JS-runtime adapters.
 *   3. `loweringMatchers` (#2057/#2069) — structural `LoweringPlugin`
 *      recognition, for user-imported helpers that were never (and can
 *      never be) added to the string-keyed registry.
 *
 * Before any of the three checks, the callee path is resolved through
 * `aliasTargets` ONE hop (#2069 R2): `const fmt = customSerialize; fmt(x)`
 * keys/matches as `customSerialize`, not `fmt`. Resolution only replaces a
 * BARE-identifier leftmost segment with a bare-identifier target — a
 * dotted alias target (`Math.floor`) only feeds the string-keyed path
 * (matchers structurally expect a real callee shape, not a synthesised
 * dotted identifier).
 *
 * Shadow guard: rejects when the leftmost identifier of the (possibly
 * alias-resolved) callee resolves to a local-ish binding kind. This
 * prevents a local variable named after a registered primitive (e.g.
 * `const JSON = props.config`) from accidentally activating the registry,
 * and — because the guard runs AFTER alias resolution — also rejects an
 * alias-to-alias chain (`const g = f` where `f` is itself an unresolved
 * local) without needing special-case transitive-chain detection: the
 * one-hop target `f` is still `init-local`/`module-local`-shadowed.
 */
function isCallAcceptedByAdapter(
  call: ts.CallExpression,
  env: RelocateEnv,
): boolean {
  const originalPath = getCalleeIdentifierPath(call.expression)
  if (originalPath === null) return false

  const leftmost = getCalleeLeftmostIdentifier(call.expression)

  // One-hop alias resolution: replace the callee's LEFTMOST SEGMENT with
  // its alias target when eligible. This resolves both a bare-identifier
  // callee (`fmt(x)` → `customSerialize(x)`) and an aliased-namespace
  // member callee (`m.floor(x)` → `Math.floor(x)` when `const m = Math`)
  // — the target text is spliced in place of the leftmost segment and any
  // remaining `.path` tail is carried over. Matcher dispatch below is
  // narrower (bare identifiers only); the string-keyed registry path uses
  // the full spliced text.
  let resolvedPath = originalPath
  let resolvedLeftmost = leftmost
  if (leftmost !== null) {
    const aliasTarget = env.aliasTargets?.get(leftmost)
    if (aliasTarget !== undefined) {
      resolvedPath =
        originalPath === leftmost
          ? aliasTarget
          : `${aliasTarget}${originalPath.slice(leftmost.length)}`
      resolvedLeftmost = aliasTarget.includes('.') ? aliasTarget.split('.')[0] : aliasTarget
    }
  }

  // Shadow guard, applied to the RESOLVED leftmost identifier. `undefined`
  // (not in bindings) means truly global — safe; we let it through. A
  // tracked binding must be in the safe set.
  if (resolvedLeftmost !== null) {
    const kind = env.bindings.get(resolvedLeftmost)
    if (kind !== undefined && !REGISTRY_SAFE_BINDING_KINDS.has(kind)) {
      return false
    }
  }

  if (env.templatePrimitives && env.templatePrimitives[resolvedPath]) return true
  if (env.acceptsTemplateCall && env.acceptsTemplateCall(resolvedPath)) return true

  if (env.loweringMatchers && env.loweringMatchers.length > 0) {
    const parsed = tsNodeToParsedExpr(call)
    if (parsed.kind === 'call') {
      // Only substitute the callee for matcher dispatch when the alias
      // target is itself a bare identifier (no dots) — matchers expect a
      // real parsed callee shape (`kind: 'identifier'`), not a synthesised
      // dotted path.
      const calleeForMatch =
        resolvedPath !== originalPath &&
        !resolvedPath.includes('.') &&
        parsed.callee.kind === 'identifier'
          ? { kind: 'identifier' as const, name: resolvedPath }
          : parsed.callee
      for (const matcher of env.loweringMatchers) {
        if (matcher(calleeForMatch, parsed.args)) return true
      }
    }
  }

  return false
}

/**
 * Re-parse a value-position expression to a `ts.Node` so the inline-
 * safety check can walk it AST-aware. Returns null when the input
 * isn't a parseable expression — caller falls back to a string-only
 * decision in that case.
 */
function parseExpressionNode(text: string): ts.Node | null {
  try {
    const sf = ts.createSourceFile(
      '__inline_check__.ts',
      `(${text});`,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TS,
    )
    const stmt = sf.statements[0]
    if (!stmt || !ts.isExpressionStatement(stmt)) return null
    const inner = stmt.expression
    return ts.isParenthesizedExpression(inner) ? inner.expression : inner
  } catch {
    return null
  }
}

/**
 * Walk `node` looking for a call expression whose argument list
 * contains an identifier classified as `lift-to-prop` or `inline` by
 * relocate. Such calls would re-execute on every template render with
 * the bridged value (e.g. `_p.roomId`) substituted in — wrong identity,
 * duplicated side effects, dropped imports.
 */
function hasCallWithBridgedArg(
  node: ts.Node,
  decisions: RelocateDecision[],
  env: RelocateEnv,
): boolean {
  const bridged = new Set<string>()
  for (const d of decisions) {
    if (d.action === 'lift-to-prop' || d.action === 'inline') bridged.add(d.name)
  }
  if (bridged.size === 0) return false

  let found = false
  function visit(n: ts.Node): void {
    if (found) return
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      // If the adapter accepts this call as a template primitive, the
      // bridged-arg risk doesn't apply to *this* call — but nested calls
      // inside its arguments still need checking.
      const accepted = ts.isCallExpression(n) && isCallAcceptedByAdapter(n, env)
      if (!accepted) {
        const args = n.arguments
        if (args) {
          for (const arg of args) {
            if (containsAnyIdentifier(arg, bridged)) {
              found = true
              return
            }
          }
        }
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/**
 * True if `node` contains any zero-argument call expression (e.g.
 * `foo()`, `bar.baz()`). Catches signal/memo getters and helpers that
 * read runtime state — both are unsafe to duplicate into template
 * scope. Mirrors the `/\b\w+\(\)/` regex the legacy CSR re-promotion
 * path used.
 */
function hasZeroArgCall(node: ts.Node, env: RelocateEnv): boolean {
  let found = false
  function visit(n: ts.Node): void {
    if (found) return
    if (ts.isCallExpression(n) && n.arguments.length === 0) {
      // Adapter-accepted callees (e.g. `Date.now`, `Math.random` if the
      // adapter chose to promise SSR↔CSR equivalence) bypass the zero-arg
      // rejection. Nested zero-arg calls inside the call's expression
      // (none for a plain `foo()`, but possible for `(getFn())()`) are
      // still walked.
      if (!isCallAcceptedByAdapter(n, env)) {
        found = true
        return
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

function containsAnyIdentifier(node: ts.Node, names: ReadonlySet<string>): boolean {
  // Walk structurally: when entering nodes whose syntactic positions
  // hold property *names* (not free references), descend only into the
  // free-reference positions. This works without parent pointers,
  // which `ts.createSourceFile` does not populate by default.
  let found = false
  function visit(n: ts.Node): void {
    if (found) return
    if (ts.isPropertyAccessExpression(n)) {
      // foo.X — `foo` is a free ref, `X` is a property name.
      visit(n.expression)
      return
    }
    if (ts.isPropertyAssignment(n)) {
      // { X: value } — `X` is a key, only `value` is a free ref.
      visit(n.initializer)
      return
    }
    if (ts.isShorthandPropertyAssignment(n)) {
      // { X } — `X` is BOTH a key and a value reference. Treat it as
      // a free ref (the shorthand reads the binding from the surrounding
      // scope, same as a bare identifier).
      if (ts.isIdentifier(n.name) && names.has(n.name.text)) {
        found = true
      }
      return
    }
    if (ts.isIdentifier(n) && names.has(n.text)) {
      found = true
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(node)
  return found
}

/**
 * String-only fallback for ref collection. Walks `bindings` keys and
 * checks each as a word-boundary match in the source. Less precise
 * than AST walking (false positives on object literal keys etc.), but
 * sufficient for call sites that only have stringified expressions.
 */
function scanRefsByName(
  text: string,
  bindings: Map<string, BindingKind>,
): Map<string, ts.Identifier[]> {
  const result = new Map<string, ts.Identifier[]>()
  for (const name of bindings.keys()) {
    const re = new RegExp(`\\b${name}\\b`)
    if (re.test(text)) result.set(name, [])
  }
  return result
}

/** Crude bareIdentifier scan over a JS expression string. */
function bareIdentifiers(text: string): string[] {
  const matches = text.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []
  return matches.filter((s) => !RESERVED_WORDS.has(s))
}

const RESERVED_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'void', 'typeof', 'instanceof',
  'new', 'delete', 'in', 'of', 'this', 'super', 'return', 'if', 'else',
  'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'function', 'class', 'const', 'let', 'var', 'async', 'await',
  'try', 'catch', 'finally', 'throw',
])

// =============================================================================
// RelocateEnv construction
// =============================================================================

/**
 * Build a `RelocateEnv` from analyzer state. Used once per component
 * (the env is pure data — caching it on `AnalyzerContext` is fine).
 *
 * Encodes the shadow-precedence rules previously distributed across
 * `analyzer.ts:1780-1797` and `jsx-to-ir.ts:135-159`. Last
 * declaration in source order wins.
 */
export function buildRelocateEnv(ctx: AnalyzerContext): RelocateEnv {
  return buildRelocateEnvFromFields({
    imports: ctx.imports,
    localFunctions: ctx.localFunctions,
    localConstants: ctx.localConstants,
    propsParams: ctx.propsParams,
    propsObjectName: ctx.propsObjectName,
    signals: ctx.signals,
    memos: ctx.memos,
  })
}

/**
 * `IRMetadata`-based variant. Used at emit time when the analyzer
 * context is no longer available — emit reconstructs the env from
 * IR. Both builders produce identical results.
 *
 * `options` carries adapter-supplied template-scope capabilities that
 * aren't part of the IR (registry of pure callees, broad-acceptance
 * predicate). They flow through to the inline-safety checks in
 * `isInlinableInTemplate` so a registered call escapes the bridged-arg
 * / zero-arg rejections.
 */
export function buildRelocateEnvFromIR(
  metadata: IRMetadata,
  options?: {
    templatePrimitives?: TemplatePrimitiveRegistry
    acceptsTemplateCall?: TemplateCallAcceptor
  },
): RelocateEnv {
  const env = buildRelocateEnvFromFields(metadata)
  if (options?.templatePrimitives) env.templatePrimitives = options.templatePrimitives
  if (options?.acceptsTemplateCall) env.acceptsTemplateCall = options.acceptsTemplateCall
  // Bind every registered LoweringPlugin (built-in + userland, #2057) to
  // THIS component's metadata once here, so `isCallAcceptedByAdapter`'s
  // per-call check is just an array iteration + matcher call — no
  // per-call import resolution (#2069). `metadata.imports` must be the
  // REAL import list for plugin `prepare()` to resolve local names
  // correctly; callers that reconstruct a synthetic `IRMetadata` (e.g.
  // `compute-inlinability.ts`'s `buildEnvFromCtx`) must populate `imports`
  // from the real component, not `[]`.
  env.loweringMatchers = prepareLoweringMatchers(metadata)
  return env
}

interface EnvFields {
  imports: AnalyzerContext['imports']
  localFunctions: AnalyzerContext['localFunctions']
  localConstants: AnalyzerContext['localConstants']
  propsParams: AnalyzerContext['propsParams']
  propsObjectName: string | null
  signals: AnalyzerContext['signals']
  memos: AnalyzerContext['memos']
}

function buildRelocateEnvFromFields(src: EnvFields): RelocateEnv {
  const bindings = new Map<string, BindingKind>()

  // Module-level imports.
  for (const imp of src.imports) {
    for (const spec of imp.specifiers) {
      bindings.set(spec.alias ?? spec.name, 'module-import')
    }
  }

  // Module-level functions and constants.
  for (const f of src.localFunctions) {
    if (f.isModule) bindings.set(f.name, 'module-local')
  }
  for (const c of src.localConstants) {
    if (c.isModule) bindings.set(c.name, 'module-local')
  }

  // Component init bindings (later overrides earlier per source order
  // because the analyzer collected in source order).

  // Props: declared first in source as the function parameter.
  for (const p of src.propsParams) {
    bindings.set(p.name, 'prop')
  }
  // The props object name (`props` in `function Foo(props: Props)`) is
  // also classified as `prop` so that expressions referencing it bare
  // (e.g. `makeStore(props)`) trigger the bridge action — without this
  // line, the relocate walk falls back to `'global'` and the call is
  // misclassified as inline-safe.
  if (src.propsObjectName) {
    bindings.set(src.propsObjectName, 'prop')
  }

  // Init-body locals — those whose value is a pure alias to `props.X`
  // STAY classified as `prop` (the lift-to-_p.X path applies). Other
  // locals are `init-local`.
  const propsObjectName = src.propsObjectName
  for (const c of src.localConstants) {
    if (c.isModule) continue
    const isPureAlias =
      typeof c.value === 'string' &&
      propsObjectName !== null &&
      (c.value === `${propsObjectName}.${c.name}` ||
        c.value.startsWith(`${propsObjectName}.${c.name} ??`))
    bindings.set(c.name, isPureAlias ? 'prop' : 'init-local')
  }

  // Init-body local functions.
  for (const f of src.localFunctions) {
    if (f.isModule) continue
    bindings.set(f.name, 'init-local')
  }

  // Signals / memos override anything declared with the same name
  // earlier (the SolidJS-style shadow case in #1132).
  for (const s of src.signals) {
    bindings.set(s.getter, 'signal-getter')
    if (s.setter) bindings.set(s.setter, 'signal-setter')
  }
  for (const m of src.memos) {
    bindings.set(m.name, 'memo-getter')
  }

  // propsForLift: the set of names that lift to `_p.X` when relocated
  // to template scope. Equivalent to the legacy
  // `_destructuredPropNames` set.
  const propsForLift = new Set<string>()
  for (const [name, kind] of bindings) {
    if (kind === 'prop') propsForLift.add(name)
  }

  // aliasTargets (#2069 R2): one-hop alias resolution table for
  // `isCallAcceptedByAdapter`. A const whose FINAL resolved binding kind
  // is `init-local` or `module-local` (i.e. not a signal/memo/prop-alias
  // override) AND whose initializer is nothing but a bare identifier or
  // dotted identifier path (`customSerialize`, `Math.floor` — no calls,
  // no operators, no literals) is eligible. Eligibility is decided on the
  // analyzer's structured `ConstantInfo.parsed` tree (never on the raw
  // source text — see CLAUDE.md's no-regex-parsing rule); a const whose
  // initializer didn't parse is simply not an alias. Built AFTER
  // `bindings` is fully resolved (signals/memos have already overridden
  // same-named consts) so eligibility reflects the FINAL kind, not a
  // shadowed one.
  const aliasTargets = new Map<string, string>()
  for (const c of src.localConstants) {
    const kind = bindings.get(c.name)
    if (kind !== 'init-local' && kind !== 'module-local') continue
    const target = identifierPathFromParsed(c.parsed)
    if (target !== null) aliasTargets.set(c.name, target)
  }

  return {
    bindings,
    inlinable: new Map(), // populated by compute-inlinability after analyzer runs
    propsForLift,
    propsObjectName,
    allowFallback: true,
    aliasTargets,
  }
}

/**
 * The dotted identifier-path text of a parsed expression that is nothing
 * but a bare identifier or a chain of non-computed member accesses on one
 * (`foo`, `foo.bar`, `Math.floor`) — or null for every other shape
 * (calls, literals, computed access, operators…). The structured
 * counterpart of `getCalleeIdentifierPath` for `ParsedExpr` trees.
 */
function identifierPathFromParsed(expr: ParsedExpr | undefined): string | null {
  if (!expr) return null
  if (expr.kind === 'identifier') return expr.name
  if (expr.kind === 'member' && !expr.computed) {
    const object = identifierPathFromParsed(expr.object)
    return object === null ? null : `${object}.${expr.property}`
  }
  return null
}
