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
import { inferDefaultValue } from './utils.ts'
import { extractFreeIdentifiersFromNode } from '../analyzer.ts'
import type { ConstantInfo, MemoInfo, SignalInfo } from '../types.ts'
import type { BindingScope } from '../scope/binding-scope.ts'
import { resolveAliasOrigin } from '../props-binding.ts'

/**
 * CSR-substituted const value: the const's initializer with every
 * signal getter call, memo call, and reference to another CSR-inlinable
 * constant expanded via AST substitution (#1277). `freeIdentifiers` is
 * the free-id set of the rewritten AST — already transitively closed
 * through chained inlines — and is what the unsafe-name check
 * intersects with `unsafeLocalNames`.
 *
 * Lives on `ClientJsContext` (`csrInlinable`), NOT on the cross-adapter
 * `ConstantInfo` IR — substitution semantics are specific to the CSR
 * client-JS adapter and would be dead weight for SSR consumers.
 */
export interface CsrInlinableEntry {
  rewrittenValue: string
  freeIdentifiers: ReadonlySet<string>
}

/**
 * Constant-name → resolved CSR form. `null` marks the const as unsafe
 * to inline (placeholder-let, arrow-literal, system-construct,
 * jsx-inline, or post-substitution form that fails the relocate
 * inline-safety gate — #1138).
 */
export type CsrInlinabilityMap = Map<string, CsrInlinableEntry | null>

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
 *
 * `enclosingScope` (#2482 Stage 1b): an optional `BindingScope` for loop
 * bindings ENCLOSING this expression — names bound outside the
 * expression's own AST, which the internal `boundStack` (built purely
 * from arrow/function scopes found while walking `value` itself) can
 * never see on its own. Every current call site already pre-filters
 * `env.substitutions` for loop-shadowed names before calling in (see
 * `html-template.ts`'s `loop` case), so this is defense-in-depth, not a
 * currently-observable behavior change: the two mechanisms should agree
 * on what's shadowed regardless of which one runs first.
 */
export function csrSubstitute(
  value: string,
  env: CsrEnv,
  enclosingScope?: BindingScope,
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
    const step = csrSubstituteOnce(current, env, enclosingScope)
    lastFreeIdentifiers = step.freeIdentifiers
    if (step.rewritten === current) break
    current = step.rewritten
  }
  return { rewritten: current, freeIdentifiers: lastFreeIdentifiers }
}

function csrSubstituteOnce(
  value: string,
  env: CsrEnv,
  enclosingScope?: BindingScope,
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
  // `enclosingScope` seeds the OUTER frames — loop bindings introduced
  // outside `value`'s own AST (item / index / destructure / preamble) —
  // so a name bound there is treated identically to one bound by an
  // arrow/function found while walking `value` itself.
  const boundStack: Array<Set<string>> = []
  const isBound = (name: string): boolean => {
    for (let i = boundStack.length - 1; i >= 0; i--) {
      if (boundStack[i].has(name)) return true
    }
    return enclosingScope?.isBound(name) ?? false
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

  // Walk a function body Block collecting names introduced by
  // `var`/`let`/`const` declarations, so the enclosing function-scope
  // bound set shadows them. Does not descend into nested functions —
  // those have their own scope handled when `visit` reaches them.
  const collectBlockDeclarations = (block: ts.Block, out: Set<string>): void => {
    for (const stmt of block.statements) {
      if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          collectBindingNames(decl.name, out)
        }
      } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        out.add(stmt.name.text)
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

    // Arrow function: bind params + any block-scoped locals declared
    // inside the body, recurse, unbind. Pre-collecting body locals
    // before descending matters for the IIFE shape that
    // `extractMemoBodyExpr` produces for non-trivial memo bodies:
    //
    //   (() => { const items = foo; return items.length })()
    //
    // If a component-scope signal also happens to be named `items`,
    // descending without binding the inner `const` would substitute
    // `items.length` with `(initialValue).length` — wrong, because
    // the inner `const` shadows the signal. Hoisting the binding to
    // the function's scope here mirrors JS block-scope semantics
    // closely enough for the shapes IR expressions take.
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const bound = new Set<string>()
      for (const p of node.parameters) collectBindingNames(p.name, bound)
      if (node.body && ts.isBlock(node.body)) {
        collectBlockDeclarations(node.body, bound)
      }
      boundStack.push(bound)
      if (node.body) visit(node.body)
      boundStack.pop()
      return
    }

    // Variable declaration: descend into the initializer only. The
    // binding name itself is collected at the enclosing function's
    // scope (above) — visiting it here as an identifier would falsely
    // count it as a free ref.
    if (ts.isVariableDeclaration(node)) {
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
  // `rewritePropsObjectRef` (rewrite-props-object.ts) after the
  // inline-safety check — an AST walk, not a regex, so it survives a
  // parenthesised receiver (`(props).label`, produced when `props`
  // itself was just constant-inlined under a local alias) and skips
  // non-value positions a regex can't distinguish (#2737).

  // Compute free identifiers of the rewritten form by re-parsing. Avoids
  // having to track analytically through nested substitutions, which is
  // exactly the bookkeeping that made the legacy code drift from emission.
  //
  // `extractFreeIdentifiersFromText` only sees `rewritten` in isolation —
  // it has no way to know about `enclosingScope`, the loop-row bindings
  // introduced OUTSIDE this expression's own AST (`isBound`'s second half,
  // above). Without filtering by it too, a name legitimately shadowed by
  // the enclosing loop row (never substituted, since `isBound` already
  // skipped it during `visit`) still comes back as "free" here and trips
  // the caller's `unsafeLocalNames` check — the exact same identifier the
  // substitution step correctly left alone gets the UNSAFE sentinel
  // anyway. Filtering by the same `enclosingScope.isBound` predicate keeps
  // the two checks in agreement, matching this function's own docstring
  // contract above (#2814 review).
  const freeIdentifiers = extractFreeIdentifiersFromText(rewritten)
  if (enclosingScope) {
    for (const name of freeIdentifiers) {
      if (enclosingScope.isBound(name)) freeIdentifiers.delete(name)
    }
  }
  return { rewritten, freeIdentifiers }
}

export function extractFreeIdentifiersFromText(text: string): Set<string> {
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
 * Free identifiers referenced by a block of JS *statements* — e.g. an inner
 * `.map()` callback's block-body preamble (`mapPreamble`, #1052). Unlike
 * `extractFreeIdentifiersFromText`, which wraps its input in `(...)` to
 * force single-expression parsing, statement text (`const x = ...;`) is
 * not a valid expression and would fail to parse inside parens — parse it
 * as top-level source instead. Used by nested-loop index-param reference
 * gating (#2218).
 */
export function extractFreeIdentifiersFromStatementText(text: string): Set<string> {
  if (!text || text.trim().length === 0) return new Set()
  const sf = ts.createSourceFile(
    '__free_ids_stmt__.ts',
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  return extractFreeIdentifiersFromNode(sf)
}

/**
 * Free identifiers referenced inside a template-literal-style string's
 * `${...}` interpolations — e.g. a nested loop's per-item HTML `template`
 * (#2218). Wraps the text in backticks and parses it as a real
 * `TemplateExpression` so brace balancing, string literals, and nested
 * object/array literals inside `${...}` are handled correctly by the TS
 * parser (AST-based — never the char-class regex `extractTemplateExpressions`
 * in `identifiers.ts` uses for its looser references-graph pass). Safe by
 * construction: the same `template` string is embedded verbatim inside a
 * real backtick literal at emit time (`__t.innerHTML = \`${template}\``),
 * so wrapping it here to parse mirrors exactly how it's already used.
 */
export function extractFreeIdentifiersFromTemplateText(template: string): Set<string> {
  if (!template || template.length === 0) return new Set()
  const sf = ts.createSourceFile(
    '__free_ids_template__.ts',
    `(\`${template}\`);`,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isExpressionStatement(stmt)) return new Set()
  const expr = ts.isParenthesizedExpression(stmt.expression) ? stmt.expression.expression : stmt.expression
  if (!ts.isTemplateExpression(expr)) return new Set()
  const ids = new Set<string>()
  for (const span of expr.templateSpans) {
    for (const id of extractFreeIdentifiersFromNode(span.expression)) ids.add(id)
  }
  return ids
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
 * Which local consts are bare alias-hop chains that ultimately name a
 * substitutable signal/memo getter (`isGetter`) — e.g. `const
 * items__alias = items` where `items` is a signal getter. Returns
 * alias name → origin getter name (the alias itself is never a key of
 * its own map, so `origin !== alias` always holds for entries returned).
 *
 * A bare identifier alias of a getter is NOT an "inlinable const" in the
 * ordinary sense (#2778): `populateCsrInlinable`'s generic path resolves
 * a const's initializer through `csrSubstitute`/relocate, and `items`
 * used bare (not called) is a `signal-getter` there, which relocate can
 * only answer with its own `undefined` FALLBACK (correct when `items`
 * itself appears bare, wrong once frozen as `items__alias`'s permanent
 * value — a wrong substitution, not a missing one, so the #2468 scope
 * gate can't see it either since `undefined` is a real in-scope global).
 * Resolving the alias to its origin BEFORE that generic path runs, and
 * registering it as the origin's own call-kind entry, means
 * `items__alias()` is substituted by the exact mechanism that already
 * substitutes `items()` correctly — one call-kind entry, not a second
 * "identifier that means undefined-unless-called" special case.
 *
 * Reuses `resolveAliasOrigin` (`props-binding.ts`) — the same hop-walker
 * `resolveRestSpreadOriginCore` uses for the props/rest alias question —
 * rather than a second alias-chain walker for this different terminal
 * set (a signal/memo NAME here, `restPropsName`/`propsObjectName` there).
 */
export function resolveGetterAliases(
  localConstants: readonly ConstantInfo[],
  isGetter: (name: string) => boolean,
): Map<string, string> {
  const constantValues = new Map<string, string | undefined>()
  for (const c of localConstants) {
    if (c.isModule) continue
    constantValues.set(c.name, c.value)
  }
  const aliases = new Map<string, string>()
  for (const c of localConstants) {
    if (c.isModule || isGetter(c.name)) continue
    const origin = resolveAliasOrigin(constantValues, c.name, (current) => (isGetter(current) ? current : null))
    if (origin !== null && origin !== c.name) aliases.set(c.name, origin)
  }
  return aliases
}

/**
 * Build the CSR substitution env from the live `ClientJsContext`.
 *
 * Signals contribute call-kind entries (`count()` → `(initialValue)`).
 * Memos contribute call-kind entries (`bars()` → `(memoBody)`).
 *
 * Constants are NOT added here — they're resolved separately because
 * the substitution of a const value can itself reference other consts,
 * and the chain must close at IR-build time (see `populateCsrInlinable`
 * in `compute-inlinability.ts`). Inlinable-const substitutions are
 * layered into a copy of this env at `generateCsrTemplate`'s entry,
 * reading from `ClientJsContext.csrInlinable`.
 *
 * `localConstants` is consulted ONLY to resolve bare getter aliases
 * (`resolveGetterAliases`, #2778) — a name that is itself a signal/memo
 * getter always wins the `substitutions.has` check there, so `signals`/
 * `memos` stay the single source of truth for what a getter name means;
 * this just extends which SOURCE NAMES reach that same meaning.
 */
export function buildSignalMemoEnv(
  signals: readonly SignalInfo[],
  memos: readonly MemoInfo[],
  propsObjectName: string | null,
  localConstants: readonly ConstantInfo[] = [],
): CsrEnv {
  const substitutions = new Map<string, CsrSubstitution>()
  for (const s of signals) {
    // Env signals (#2057) have no static initial value to bake — their getter
    // is a live request-scoped read (`searchParams().get(k)`). Leave it in the
    // CSR template as a real call; `emitRegistrationAndHydration`'s
    // `buildTemplateDefPart` (#2654) gives the template lambda its own
    // `const [<getter>] = <envFactory>()` prelude so the call resolves.
    if (s.envReader) continue
    substitutions.set(s.getter, {
      kind: 'call',
      replacement: normalizeSignalInitial(s, propsObjectName),
      freeIdentifiers: s.initialFreeIdentifiers ?? new Set(),
    })
  }
  for (const m of memos) {
    substitutions.set(m.name, {
      kind: 'call',
      // Destructured mode (#2468): `templateComputation` (when present) has
      // bare destructured prop refs already rewritten to `_p.X` — the
      // spliced body lands in the module-scope template arrow, which is not
      // a closure over init's `const value = _p.value` extraction. Mirrors
      // the signal `templateInitialValue` handling above (#2265).
      replacement: extractMemoBodyExpr(m.templateComputation ?? m.computation),
      freeIdentifiers: m.computationFreeIdentifiers ?? new Set(),
    })
  }
  for (const [alias, origin] of resolveGetterAliases(localConstants, (n) => substitutions.has(n))) {
    substitutions.set(alias, substitutions.get(origin)!)
  }
  return { substitutions, propsObjectName }
}

/**
 * Add the `?? <default>` SSR fallback to a signal's initial value when
 * the value is a bare `propsName.X` reference. Returns the value in raw
 * (props.X) form — the `propsObjectName → _p` rewrite is deferred to
 * `rewritePropsObjectRef` at emit time so the post-substitution
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
  // Destructured mode (#2265): `templateInitialValue` (when present) has
  // bare destructured prop refs already rewritten to `_p.X` — the
  // module-scope CSR `template:` arrow can't see the bare name (it isn't
  // a closure over `initXxx`'s `const size = _p.size` extraction), which
  // otherwise throws `ReferenceError` at template-eval time. The `??`
  // fallback branch above only applies to object-props mode (a raw
  // `props.X` prefix match), so it's checked against the ORIGINAL value.
  return signal.templateInitialValue ?? initialValue
}

