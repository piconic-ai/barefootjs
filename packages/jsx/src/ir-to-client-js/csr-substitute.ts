/**
 * AST-based CSR template substitution (#1277).
 *
 * The CSR template lambda runs at module scope, so any expression that
 * lands inside it must have its component-scope-only references rewritten:
 *
 *   - signal getter calls (`count()`)            → `(initialValue)`
 *   - memo getter calls   (`bars()`)             → `(computationBody)`
 *   - bare inlinable-const refs (`label`)        → `(csrInlinable.rewrittenValue)`
 *   - bare source-level props refs (`props.x`)   → `_p.x`
 *
 * Pre-#1277 this happened twice: once over const initializers
 * (`buildCsrInlinableConstants` in `emit-registration.ts`) and once over
 * every template expression position (the four regex loops in
 * `transformExpr`). The second pass needed a defensive lexer scan
 * (`tokenContainsAny`) to catch unsafe leakage that the regex couldn't
 * prevent on its own. The duplication was the failure mode #1100 was
 * filed against — a local memo named `bars` corrupted `ctx.bars()`
 * because the substitution didn't respect member access.
 *
 * This module makes substitution AST-aware (member-access shadowing
 * works for free), tracks the post-substitution free-id set exactly,
 * and is run once at IR-build time. Emit reads the precomputed values
 * directly with no string transformation of its own.
 */

import ts from 'typescript'
import { PROPS_PARAM, inferDefaultValue } from './utils'
import { extractFreeIdentifiersFromNode } from '../analyzer'
import type { ClientJsContext } from './types'
import type { ConstantInfo, MemoInfo, SignalInfo } from '../types'

/**
 * A single substitution: when the source expression mentions `name`
 * (either bare or as a zero-arg call, depending on `kind`), the AST
 * walker splices `replacement` in place.
 */
export interface CsrSubstitution {
  kind: 'call' | 'identifier'
  /** Replacement expression text — wrapped in parens by the splicer. */
  replacement: string
  /** Free identifiers of `replacement` — feeds the post-substitution free-id union. */
  freeIdentifiers: ReadonlySet<string>
}

export interface CsrEnv {
  /**
   * Map of name → substitution. Call-kind entries match `name()`
   * (zero-arg call with bare-ident callee) and replace the entire
   * call expression; identifier-kind entries match bare uses of
   * `name` outside member-access tails.
   */
  substitutions: Map<string, CsrSubstitution>
  /** Source-level props object name (`props`); null for destructured-args. */
  propsObjectName: string | null
}

/**
 * Substitute an expression for CSR template scope. Returns the rewritten
 * text plus the free identifiers of the rewritten form.
 *
 * Substitutions are applied via AST position scanning: the AST walk
 * collects (start, end, replacement) tuples and the source string is
 * spliced in a single pass. This means member-access shadowing
 * (`ctx.bars()` when a local memo `bars` exists, #1100) is handled
 * structurally — the property-name `bars` is never visited as a free
 * identifier — and no `(?<![-.])` lookbehind is needed.
 *
 * The post-substitution free-id set is computed by re-parsing the result
 * so chained inline expansions (const A inlines to a form that mentions
 * const B's already-rewritten value) stay accurate without analytical
 * bookkeeping.
 */
export function csrSubstitute(
  value: string,
  env: CsrEnv,
): { rewritten: string; freeIdentifiers: ReadonlySet<string> } {
  if (!value || value.trim().length === 0) {
    return { rewritten: value, freeIdentifiers: new Set() }
  }

  // Fixed-point iteration handles substitutions whose replacements
  // themselves mention env-resolvable names (memo body references
  // another memo / inlinable const). Bounded by env size so we can't
  // loop on a pathological mutual reference.
  const maxIter = env.substitutions.size + 1
  let current = value
  let lastFreeIdentifiers: ReadonlySet<string> = new Set()
  for (let i = 0; i < maxIter; i++) {
    const step = csrSubstituteOnce(current, env)
    lastFreeIdentifiers = step.freeIdentifiers
    if (step.rewritten === current) break
    current = step.rewritten
  }
  return { rewritten: current, freeIdentifiers: lastFreeIdentifiers }
}

function csrSubstituteOnce(
  value: string,
  env: CsrEnv,
): { rewritten: string; freeIdentifiers: ReadonlySet<string> } {
  if (!value || value.trim().length === 0) {
    return { rewritten: value, freeIdentifiers: new Set() }
  }
  const sourceFile = ts.createSourceFile(
    '__csr_substitute__.ts',
    `(${value});`,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const stmt = sourceFile.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) {
    return { rewritten: value, freeIdentifiers: extractFreeIdentifiersFromText(value) }
  }
  const exprNode = ts.isParenthesizedExpression(stmt.expression)
    ? stmt.expression.expression
    : stmt.expression

  // Offset between the source positions in `sourceFile` (which prepended
  // "(" to make the source parse as a statement) and the user's value.
  // The opening "(" is one char; subtract it to map back.
  const OFFSET = 1

  type Splice = { start: number; end: number; text: string }
  const splices: Splice[] = []

  // Track the bound names in nested arrow/function scopes so we don't
  // substitute identifiers shadowed by a parameter or local binding.
  const boundStack: Array<Set<string>> = []
  const isBound = (name: string): boolean => {
    for (let i = boundStack.length - 1; i >= 0; i--) {
      if (boundStack[i].has(name)) return true
    }
    return false
  }

  const recordSubstitution = (start: number, end: number, sub: CsrSubstitution): void => {
    splices.push({ start: start - OFFSET, end: end - OFFSET, text: `(${sub.replacement})` })
  }

  const collectBindingNames = (name: ts.BindingName, out: Set<string>): void => {
    if (ts.isIdentifier(name)) out.add(name.text)
    else if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) collectBindingNames(el.name, out)
    } else if (ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) {
        if (!ts.isOmittedExpression(el)) collectBindingNames(el.name, out)
      }
    }
  }

  function visit(node: ts.Node): void {
    // Zero-arg call with bare-ident callee: `name()`. May be a signal
    // getter or memo call we should substitute. The callee identifier is
    // visited as part of the call (we don't recurse into it separately).
    if (ts.isCallExpression(node) && node.arguments.length === 0 && ts.isIdentifier(node.expression)) {
      const calleeName = node.expression.text
      if (!isBound(calleeName)) {
        const sub = env.substitutions.get(calleeName)
        if (sub && sub.kind === 'call') {
          recordSubstitution(node.getStart(sourceFile), node.getEnd(), sub)
          return
        }
      }
      // Fall through: descend into arguments (none, but keep the contract).
      ts.forEachChild(node, visit)
      return
    }

    // Property access: `obj.prop` — visit `obj` (free ref), skip `prop`
    // (member tail, structurally not a free ref). This is the structural
    // protection that #1100 needs — `ctx.bars()` exposes `ctx` as the
    // free ref, never `bars`.
    if (ts.isPropertyAccessExpression(node)) {
      visit(node.expression)
      return
    }

    // Property assignment in object literal: `{ X: value }` — `X` is a
    // key, not a free ref. `value` is.
    if (ts.isPropertyAssignment(node)) {
      visit(node.initializer)
      return
    }

    // Shorthand property: `{ X }` — `X` IS both a key and a value
    // reference. Treat the value side as a free ref.
    if (ts.isShorthandPropertyAssignment(node)) {
      if (ts.isIdentifier(node.name) && !isBound(node.name.text)) {
        const sub = env.substitutions.get(node.name.text)
        if (sub && sub.kind === 'identifier') {
          // The shorthand expands to a key-value pair when we substitute,
          // so emit `name: (replacement)` to keep the object literal
          // grammatical. Position spans the whole shorthand.
          splices.push({
            start: node.getStart(sourceFile) - OFFSET,
            end: node.getEnd() - OFFSET,
            text: `${node.name.text}: (${sub.replacement})`,
          })
        }
      }
      return
    }

    // Arrow function: bind params, recurse, unbind.
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const bound = new Set<string>()
      for (const p of node.parameters) collectBindingNames(p.name, bound)
      boundStack.push(bound)
      // Visit body only (parameter type-annotations are stripped at IR
      // build, and we don't substitute in parameter defaults — same as
      // the analyzer's free-id extraction).
      if (node.body) visit(node.body)
      boundStack.pop()
      return
    }

    // Variable declaration introduces a local binding visible to
    // sibling/later code in the same block; tracking that precisely
    // would need full block-scope analysis. Same-scope substitution
    // collisions are rare in IR expressions (`let x = ...; x + 1`
    // appears only in `mapPreamble` style fragments), and a false
    // positive there is detectable downstream. Visit children
    // normally; the bound name is captured by the enclosing arrow/
    // function's scope when one exists.
    if (ts.isVariableDeclaration(node)) {
      // Skip the binding name (it's a declaration, not a free ref).
      if (node.initializer) visit(node.initializer)
      return
    }

    // Bare identifier reference.
    if (ts.isIdentifier(node)) {
      if (isBound(node.text)) return
      const sub = env.substitutions.get(node.text)
      if (sub && sub.kind === 'identifier') {
        recordSubstitution(node.getStart(sourceFile), node.getEnd(), sub)
      }
      return
    }

    ts.forEachChild(node, visit)
  }

  visit(exprNode)

  // Apply splices in reverse order so earlier positions stay valid.
  splices.sort((a, b) => b.start - a.start)
  let rewritten = value
  for (const s of splices) {
    rewritten = rewritten.slice(0, s.start) + s.text + rewritten.slice(s.end)
  }

  // Note: the `propsObjectName.X → _p.X` rewrite is intentionally NOT
  // done here. Keeping the substitution output in raw (props.X) form
  // lets `isInlinableInTemplate` see bridged prop references and
  // reject calls like `useYjs(props.X)` from the inline path (#1138).
  // Callers that want the emit-form (`_p.X`) apply the rewrite via
  // `applyPropsRewrite` after the inline-safety check.

  // Compute free identifiers of the rewritten form by re-parsing. Avoids
  // having to track analytically through nested substitutions, which is
  // exactly the bookkeeping that made the legacy code drift from emission.
  return { rewritten, freeIdentifiers: extractFreeIdentifiersFromText(rewritten) }
}

/**
 * Apply the source-level `propsObjectName.X → _p.X` rewrite. Runs as
 * a separate step (not inside `csrSubstitute`) so the substitution
 * output stays in raw form long enough for `isInlinableInTemplate`
 * to detect bridged-arg calls (#1138).
 */
export function applyPropsRewrite(text: string, propsObjectName: string | null): string {
  if (!propsObjectName || propsObjectName === PROPS_PARAM) return text
  return text.replace(new RegExp(`\\b${propsObjectName}\\.`, 'g'), `${PROPS_PARAM}.`)
}

function extractFreeIdentifiersFromText(text: string): Set<string> {
  if (!text || text.trim().length === 0) return new Set()
  const sf = ts.createSourceFile(
    '__free_ids__.ts',
    `(${text});`,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) return new Set()
  const expr = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression
  return extractFreeIdentifiersFromNode(expr)
}

/**
 * Reduce a memo's `() => expr` source to the expression that should be
 * substituted in for `memoName()`. Matches the extraction done by the
 * legacy `buildSignalAndMemoMaps` in `emit-registration.ts`:
 *
 *   - `() => expr`               → `expr`
 *   - `() => { return e; }`      → `e`
 *   - `() => { ...complex... }`  → `(() => { ...complex... })()`
 *
 * The IIFE form for non-trivial blocks keeps intermediate `const`/`let`
 * bindings in scope; inlining the block bare would dangle them.
 */
export function extractMemoBodyExpr(computation: string): string {
  const arrowMatch = computation.match(/^\(\)\s*=>\s*(.+)$/s)
  if (!arrowMatch) return computation
  const body = arrowMatch[1].trim()
  if (!body.startsWith('{')) return body
  const simpleReturn = body.match(/^\{\s*return\s+([\s\S]+?)\s*;?\s*\}$/)
  if (simpleReturn) return simpleReturn[1]
  return `(() => ${body})()`
}

/**
 * Build the CSR substitution env from the live `ClientJsContext`.
 *
 * Signals contribute call-kind entries (`count()` → `(initialValue)`).
 * Memos contribute call-kind entries (`bars()` → `(memoBody)`).
 *
 * Constants are NOT added here — they're resolved separately because
 * the `csrInlinable` AST substitution itself can reference other
 * constants, and the chain must close at IR-build time
 * (see `computeCsrInlinabilityChain` in `compute-inlinability.ts`).
 * Inlinable-const substitutions are added per-component when emitting
 * template positions via `buildExpressionSubstitutionEnv`.
 */
export function buildSignalMemoEnv(
  signals: readonly SignalInfo[],
  memos: readonly MemoInfo[],
  propsObjectName: string | null,
): CsrEnv {
  const substitutions = new Map<string, CsrSubstitution>()
  for (const s of signals) {
    substitutions.set(s.getter, {
      kind: 'call',
      replacement: normalizeSignalInitial(s, propsObjectName),
      freeIdentifiers: s.initialFreeIdentifiers ?? new Set(),
    })
  }
  for (const m of memos) {
    substitutions.set(m.name, {
      kind: 'call',
      replacement: extractMemoBodyExpr(m.computation),
      freeIdentifiers: m.computationFreeIdentifiers ?? new Set(),
    })
  }
  return { substitutions, propsObjectName }
}

/**
 * Add the `?? <default>` SSR fallback to a signal's initial value when
 * the value is a bare `propsName.X` reference. Returns the value in raw
 * (props.X) form — the `propsObjectName → _p` rewrite is deferred to
 * `applyPropsRewrite` at emit time so the post-substitution
 * `isInlinableInTemplate` check still sees bridged-arg shapes (#1138).
 *
 * The `??` fallback prevents literal `undefined` from leaking into the
 * SSR HTML when the prop is omitted — `inferDefaultValue` picks a
 * type-appropriate sentinel (`0` for number, `''` for string, etc.).
 * Skipped when the value already carries its own `??` so user-supplied
 * defaults aren't masked.
 */
function normalizeSignalInitial(signal: SignalInfo, propsObjectName: string | null): string {
  const initialValue = signal.initialValue
  const propsName = propsObjectName ?? 'props'
  const propsPrefix = `${propsName}.`
  if (initialValue.startsWith(propsPrefix) && !initialValue.includes('??')) {
    return `${initialValue} ?? ${inferDefaultValue(signal.type)}`
  }
  return initialValue
}

/**
 * Extend a base env (signal+memo substitutions) with constant-inlining
 * substitutions for the consts that have a non-null `csrInlinable`
 * entry. Returns a fresh env so callers can layer per-position context
 * without mutating the base.
 */
export function withConstantSubstitutions(
  base: CsrEnv,
  constants: readonly ConstantInfo[],
): CsrEnv {
  const substitutions = new Map(base.substitutions)
  for (const c of constants) {
    if (c.csrInlinable) {
      substitutions.set(c.name, {
        kind: 'identifier',
        replacement: c.csrInlinable.rewrittenValue,
        freeIdentifiers: c.csrInlinable.freeIdentifiers,
      })
    }
  }
  return { substitutions, propsObjectName: base.propsObjectName }
}

/**
 * Convenience: build a fully-loaded CSR env (signals + memos + consts).
 * Used by the per-template-position substitution at emit time.
 */
export function buildFullCsrEnv(ctx: ClientJsContext): CsrEnv {
  const base = buildSignalMemoEnv(ctx.signals, ctx.memos, ctx.propsObjectName)
  return withConstantSubstitutions(base, ctx.localConstants)
}
