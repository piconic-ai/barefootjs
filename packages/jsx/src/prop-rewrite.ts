/**
 * AST-based prop reference rewriting for client JS templates.
 *
 * Walks the TypeScript AST to identify destructured prop names used as
 * value references (not as object keys, property access targets, or
 * shorthand properties), then splices `_p.` onto exactly those
 * references in the emitted text via a second scope-aware walk over
 * the text's own AST.
 *
 * Scope model: a name bound INSIDE the expression — a nested arrow /
 * function parameter, a block-scoped declaration, a catch variable —
 * refers to that binding, not the prop, for the whole binding's scope.
 * Both the discovery walk and the rewrite walk carry the same binding
 * stack, so `items.map((title) => title.a)` never turns into the
 * syntactically invalid `.map((_p.title) => _p.title.a)` when `title`
 * is also a prop. (Names bound by loop callbacks that ENCLOSE the
 * expression are the caller's job — see the `ctx.scope` filter in
 * `jsx-to-ir.ts`'s `rewriteBarePropRefs` wrapper, #2222.)
 */

import ts from 'typescript'
import { PROPS_PARAM } from './ir-to-client-js/utils.ts'
import { createTemplateAwareStringProtector } from './ir-to-client-js/html-template.ts'

/** Collect every name introduced by a binding name (identifier or pattern). */
function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text)
    return
  }
  for (const el of name.elements) {
    if (ts.isBindingElement(el)) collectBindingNames(el.name, out)
  }
}

/**
 * Names bound by `n` for its subtree, or null when `n` introduces no
 * scope. Function-likes bind their parameters (and a function
 * expression its own name); blocks bind their statement-level
 * variable/function declarations; catch clauses bind their variable.
 */
function scopeFrameOf(n: ts.Node): Set<string> | null {
  if (ts.isFunctionLike(n)) {
    const frame = new Set<string>()
    for (const p of n.parameters) collectBindingNames(p.name, frame)
    if ((ts.isFunctionExpression(n) || ts.isFunctionDeclaration(n)) && n.name) frame.add(n.name.text)
    return frame.size > 0 ? frame : null
  }
  if (ts.isBlock(n)) {
    const frame = new Set<string>()
    for (const st of n.statements) {
      if (ts.isVariableStatement(st)) {
        for (const d of st.declarationList.declarations) collectBindingNames(d.name, frame)
      } else if (ts.isFunctionDeclaration(st) && st.name) {
        frame.add(st.name.text)
      }
    }
    return frame.size > 0 ? frame : null
  }
  if (ts.isCatchClause(n) && n.variableDeclaration) {
    const frame = new Set<string>()
    collectBindingNames(n.variableDeclaration.name, frame)
    return frame.size > 0 ? frame : null
  }
  return null
}

/**
 * Depth-first walk that maintains the binding stack described above and
 * reports every identifier along with whether a binding within `root`
 * currently shadows it.
 */
function walkWithScope(
  root: ts.Node,
  visit: (ident: ts.Identifier, parent: ts.Node | undefined, shadowed: boolean) => void,
): void {
  const scopeStack: Set<string>[] = []
  const isShadowed = (name: string) => scopeStack.some(frame => frame.has(name))
  function rec(n: ts.Node, parent?: ts.Node) {
    const frame = scopeFrameOf(n)
    if (frame) scopeStack.push(frame)
    if (ts.isIdentifier(n)) visit(n, parent, isShadowed(n.text))
    ts.forEachChild(n, child => rec(child, n))
    if (frame) scopeStack.pop()
  }
  rec(root)
}

/**
 * True when `n` sits in a non-value position where a prop rewrite must
 * never apply: an object-literal key, a member-access name, a binding
 * position (parameter / variable / binding-element name), or a type
 * reference.
 */
function isNonValuePosition(n: ts.Identifier, parent: ts.Node | undefined): boolean {
  if (!parent) return false
  if (ts.isPropertyAssignment(parent) && parent.name === n) return true
  if (ts.isPropertyAccessExpression(parent) && parent.name === n) return true
  if (ts.isQualifiedName(parent) && parent.right === n) return true
  if ((ts.isParameter(parent) || ts.isVariableDeclaration(parent) || ts.isBindingElement(parent)) && parent.name === n) return true
  if (ts.isTypeReferenceNode(parent)) return true
  return false
}

/**
 * Walk an AST node for destructured-prop value references and add
 * each found name to `out`. Same skip rules as the rewrite path —
 * object-literal keys, shorthand properties, property-access names,
 * and names shadowed by a binding inside `node` are excluded so only
 * true value references get picked up. Exported for callers that need
 * the raw discovery set (e.g. the branch-local prop-dep cache from
 * #1425).
 */
export function collectAstPropRefs(
  node: ts.Node,
  propNames: Set<string>,
  out: Set<string>,
): void {
  walkWithScope(node, (n, parent, shadowed) => {
    if (shadowed || !propNames.has(n.text)) return
    if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === n) return
    if (isNonValuePosition(n, parent)) return
    out.add(n.text)
  })
}

/**
 * Scope-aware rewrite: parse `text` as an expression, walk it with the
 * binding stack, and splice `${PROPS_PARAM}.` onto exactly the
 * identifier references that are (a) in `propRefs` and (b) not
 * shadowed by a binding inside the text. Shorthand properties expand
 * (`{ org }` → `{ org: _p.org }`) so the result stays syntactically
 * valid.
 *
 * Returns null when `text` does not parse cleanly as an expression —
 * the caller falls back to the legacy regex rewrite.
 */
function applyScopedPropRefRewrite(
  text: string,
  propRefs: Set<string>,
  propAliases?: ReadonlyMap<string, string>,
): string | null {
  // Wrap in parens so object literals and arrows parse as expressions.
  const prefix = '('
  const sf = ts.createSourceFile('__bf_prop_rewrite.ts', `${prefix}${text}\n)`, ts.ScriptTarget.Latest, true)
  const parseDiagnostics = (sf as unknown as { parseDiagnostics?: unknown[] }).parseDiagnostics
  if (parseDiagnostics && parseDiagnostics.length > 0) return null

  const edits: Array<{ start: number; end: number; replacement: string }> = []
  walkWithScope(sf, (n, parent, shadowed) => {
    if (shadowed || !propRefs.has(n.text)) return
    if (isNonValuePosition(n, parent)) return
    const start = n.getStart(sf) - prefix.length
    const end = n.getEnd() - prefix.length
    if (start < 0 || end > text.length) return
    // `_p` is always keyed by the caller-facing name (`sourceName ?? name`
    // — #2524 CSR half); the local binding (`n.text`) only survives on the
    // left of a shorthand expansion.
    const callerKey = propAliases?.get(n.text) ?? n.text
    if (parent && ts.isShorthandPropertyAssignment(parent) && parent.name === n) {
      edits.push({ start, end, replacement: `${n.text}: ${PROPS_PARAM}.${callerKey}` })
      return
    }
    edits.push({ start, end, replacement: `${PROPS_PARAM}.${callerKey}` })
  })

  if (edits.length === 0) return text
  let result = text
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
  }
  return result
}

/**
 * Apply the targeted regex rewrite for one or more prop names on a
 * type-stripped expression text. Idempotent under `_p.X` (negative
 * lookbehind on `_p\\.`) and skips object-literal keys via the
 * post-match `{,` + `:` shape check.
 *
 * Legacy fallback for text that doesn't parse as a standalone
 * expression — it cannot see scopes, so `applyScopedPropRefRewrite`
 * is always tried first.
 */
export function applyRegexPropRefRewrite(
  text: string,
  propRefs: Iterable<string>,
  propAliases?: ReadonlyMap<string, string>,
): string {
  const { protect, restore } = createTemplateAwareStringProtector()
  let result = protect(text)

  for (const propName of propRefs) {
    // `_p` is always keyed by the caller-facing name (#2524 CSR half).
    const callerKey = propAliases?.get(propName) ?? propName
    const pattern = new RegExp(`(?<!${PROPS_PARAM}\\.)(?<!['"\\w.-])\\b${propName}\\b(?![a-zA-Z0-9_$])`, 'g')
    result = result.replace(pattern, (match, offset, str) => {
      // Skip object literal keys: preceded by { or , and followed by :
      const after = str.slice(offset + match.length)
      if (/^\s*:(?!:)/.test(after)) {
        const before = str.slice(0, offset)
        if (/[{,]\s*$/.test(before)) return match
      }
      return `${PROPS_PARAM}.${callerKey}`
    })
  }

  return restore(result)
}

/**
 * Rewrite bare destructured prop references in expression text.
 * Returns undefined if no rewriting was needed.
 *
 * @param text - The type-stripped expression text
 * @param node - The AST node for structural analysis
 * @param propNames - Set of destructured prop names to rewrite
 * @param extraPropRefs - Optional prop names known to appear in
 *   `text` via substitution sources the AST walk can't see (e.g.
 *   `text` was produced by inlining a branch-local whose initializer
 *   references the prop). The rewrite only touches genuine value
 *   references, so passing an over-broad set is safe.
 * @param propAliases - Local name → caller-facing key (`sourceName ?? name`)
 *   for aliased destructured props (`{ n: count }` → `count` → `n`).
 *   `_p` is always keyed by the caller-facing name (#2524 CSR half); a name
 *   absent from this map emits `_p.<name>` unchanged (the un-aliased case,
 *   where `sourceName ?? name` is an identity).
 */
export function rewriteBarePropRefs(
  text: string,
  node: ts.Node,
  propNames: Set<string>,
  extraPropRefs?: ReadonlySet<string>,
  propAliases?: ReadonlyMap<string, string>,
): string | undefined {
  // Walk AST to find which prop names are actually used as value references
  const foundPropRefs = new Set<string>()
  collectAstPropRefs(node, propNames, foundPropRefs)
  if (extraPropRefs) {
    for (const ref of extraPropRefs) {
      if (propNames.has(ref)) foundPropRefs.add(ref)
    }
  }
  if (foundPropRefs.size === 0) return undefined
  return (
    applyScopedPropRefRewrite(text, foundPropRefs, propAliases) ??
    applyRegexPropRefRewrite(text, foundPropRefs, propAliases)
  )
}
