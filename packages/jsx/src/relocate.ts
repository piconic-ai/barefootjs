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
import type { Scope, BindingKind, IRMetadata } from './types'
import { isVisibleIn } from './types'
import type { AnalyzerContext } from './analyzer-context'
import { PROPS_PARAM } from './ir-to-client-js/utils'

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
    // Lift `name` → `_p.name`.
    return { action: 'lift-to-prop', rewrittenAs: `${PROPS_PARAM}.${name}` }
  }

  if ((kind === 'init-local' || kind === 'sub-init-local') && toScope === 'template') {
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
 */
export function buildRelocateEnvFromIR(metadata: IRMetadata): RelocateEnv {
  return buildRelocateEnvFromFields(metadata)
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

  return {
    bindings,
    inlinable: new Map(), // populated by compute-inlinability after analyzer runs
    propsForLift,
    propsObjectName,
    allowFallback: true,
  }
}
