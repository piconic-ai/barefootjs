/**
 * Is a `.map()` callback preamble safe to run inside a LAZY row's apply
 * bodies? — `spec/slot-unification.md` §9.5, the "row has a map-callback
 * preamble" widening.
 *
 * ## Why the old rule was "any preamble at all"
 *
 * The eager emission runs the preamble ONCE per row, inside `renderItem`.
 * The lazy emission has no per-row body — a row's writes are split across
 * `createRow` / `applyItem` / `applyOuter`, each a separate function called
 * at a different time. To let a binding read a preamble-declared local, the
 * preamble's statements have to be re-executed at the top of every body that
 * needs them. Two things follow, and both have to be PROVEN, not assumed:
 *
 *  1. **Re-execution must be observationally free.** Running the statements
 *     three times instead of once is only sound if they have no effects and
 *     allocate nothing whose identity is load-bearing. A preamble declaring a
 *     signal (`const [x, setX] = createSignal(0)`) would mint a NEW signal on
 *     every apply — the row would silently lose its state.
 *  2. **No reactive binding may read a preamble local.** A binding's
 *     dependency set is its own free identifiers; a preamble local hides
 *     whatever the preamble read (`const cls = selected() === row.id ? …`),
 *     so classifying `cls` on its own name would put the binding in
 *     `applyItem` only and the row would never react to `selected()`.
 *
 *     That case is REFUSED rather than modelled, because it is currently
 *     unreachable and paying for unreachable machinery is how a gate rots: a
 *     preamble local read in CHILD position becomes a `preambleRegions` entry
 *     (`IRLoop.preambleRegions`, #2389) which the gate already refuses on its
 *     own, and one read in ATTRIBUTE position is not classified as reactive at
 *     all, so it is interpolated into the row template and never becomes a
 *     `reactiveAttrs` binding. `lazyRowEligibility` therefore refuses any
 *     binding whose free identifiers touch `declaredNames`, and that refusal
 *     is what keeps this sound if either of those two facts ever changes.
 *
 * ## The proof this module accepts
 *
 * Deliberately narrow, and structural — no regex, per the repo rule. A
 * preamble qualifies only when it is a sequence of `const` declarations whose
 * initializers cannot do anything:
 *
 *  - Every statement is a `const` `VariableStatement`. A `let` can be
 *    reassigned by a later statement, a `function`/`class` declaration is a
 *    fresh object per run, and any other statement kind (an `if`, a bare
 *    call, a `for`) is either an effect or control flow this analysis does
 *    not model.
 *  - Every declaration has an initializer, and that initializer contains no
 *    `new`, tagged template, assignment, `++`/`--`, `await`, `yield`,
 *    `delete`, or function/arrow/class expression.
 *  - **Calls are refused with ONE exception: a zero-argument call to a
 *    component signal or memo getter.** That exception is the whole point —
 *    `const cls = selected() === row.id ? 'on' : 'off'` is the shape the
 *    krausest bench writes, and a signal read is pure, deterministic, and
 *    already the unit this design primes and subscribes to. Every other call
 *    stays refused: `createSignal` is a call, `arr.push(x)` is a call,
 *    `Math.random()` is a call whose value would differ between `createRow`
 *    and `applyItem`, and an ordinary-looking local can hide a reactive
 *    accessor behind one (`isSelected(row.id)` — see `classifyLazyBinding`'s
 *    note) which this emitter cannot prime.
 *
 *    The signal read is sound in all three bodies because of where they run:
 *    `createRow` and `applyItem` are wrapped in `untrack()` by `mapArrayLazy`,
 *    so a read there subscribes nothing, and `applyOuter` IS the loop-level
 *    effect that is supposed to subscribe. A preamble-declared local therefore
 *    behaves exactly like a binding expression that read the same signal
 *    directly.
 *  - No `jsx` segment. A JSX leaf in the preamble means the row accumulates
 *    markup, which is `preambleRegions` territory (refused separately).
 *  - No `builderNames`. Same shape as above, pinned explicitly so the reason
 *    names it rather than surfacing as a confusing "contains a call".
 *  - The preamble does not read the loop's INDEX parameter. `applyItem` and
 *    `applyOuter` have no index to give it — the same reason
 *    `ClassifiedLazyBinding.referencesIndex` refuses a binding.
 *
 * Member access is deliberately NOT banned even though a getter could in
 * principle run code: a binding expression like `class={row.cls}` is already
 * re-evaluated on every apply by design, so a call-free preamble is exactly
 * the same risk class as the emission this feature extends. Banning member
 * access would reject every useful preamble and buy no real guarantee.
 *
 * Everything refused carries a specific reason — `lazyRowEligibility` passes
 * it straight through, so a unit test naming the shape gets a diagnosable
 * failure instead of a silent fallback to eager emission.
 */

import ts from 'typescript'
import { preambleAnalysisText, type MapCallbackPreamble } from '../../../types.ts'
import { extractFreeIdentifiersFromStatementText } from '../../csr-substitute.ts'

/** What the gate and the binding classifier need to know about a preamble. */
export interface LazyPreambleFacts {
  /**
   * Names the preamble declares. A binding naming one of these is reading a
   * ROW-LOCAL value, not an outer one — and the name SHADOWS any
   * component-scope signal/const of the same name, which is why
   * `classifyLazyBinding` substitutes rather than falling through to the
   * component scope.
   */
  declaredNames: ReadonlySet<string>
  /**
   * What the preamble itself reads — its free identifiers, minus the names it
   * declares. This is the SUBSTITUTION set: a binding that names a preamble
   * local inherits these as its own dependencies, because that is literally
   * what the value depends on.
   *
   * Returned as raw names, unclassified, on purpose. Deciding which are row
   * locals, which are primable getters, and which are opaque needs the loop's
   * `rowLocalNames` / `indexParam` / `LazyRowScopeInfo`, none of which this
   * module has — and re-deriving that judgement here would be a second copy
   * of `classifyLazyBinding`'s rules, free to drift from the one the emitter
   * actually primes against. So the names go back unjudged and run through
   * the SAME loop a binding's own identifiers do.
   */
  freeNames: ReadonlySet<string>
}

export type LazyPreambleAnalysis =
  | { lazySafe: true; facts: LazyPreambleFacts }
  | { lazySafe: false; reason: string }

/** No preamble at all — nothing to prove, nothing to substitute. */
export const NO_PREAMBLE: LazyPreambleAnalysis = {
  lazySafe: true,
  facts: { declaredNames: new Set(), freeNames: new Set() },
}

const NO = (reason: string): LazyPreambleAnalysis => ({ lazySafe: false, reason })

/**
 * Decide whether `preamble` may be re-executed inside a lazy row's apply
 * bodies, and if so what it declares and reads.
 *
 * `indexParam` is the loop's index parameter name as the emitter uses it
 * (`elem.index || '__idx'`); a preamble reading it is refused.
 *
 * `primableNames` are the component's signal getters and memos — the only
 * callees a preamble initializer may invoke (see the module docstring). Pass
 * the same names `LazyRowScopeInfo` carries, so "primable here" and "primable
 * in `classifyLazyBinding`" cannot drift.
 */
export function analyzeLazyPreamble(
  preamble: MapCallbackPreamble | undefined,
  indexParam: string,
  primableNames: ReadonlySet<string>,
): LazyPreambleAnalysis {
  if (!preamble) return NO_PREAMBLE

  if (preamble.builderNames.length > 0) {
    return NO(`map-callback preamble accumulates JSX leaves (${preamble.builderNames.join(', ')})`)
  }
  for (const seg of preamble.segments) {
    if (seg.kind !== 'js') return NO('map-callback preamble contains a JSX leaf')
  }

  const text = preambleAnalysisText(preamble)
  if (text.trim().length === 0) return NO_PREAMBLE

  const declaredNames = new Set<string>()
  const sf = ts.createSourceFile(
    '__lazy_preamble__.ts',
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  )

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) {
      return NO(`map-callback preamble has a non-declaration statement (${ts.SyntaxKind[stmt.kind]})`)
    }
    const isConst = (stmt.declarationList.flags & ts.NodeFlags.Const) !== 0
    if (!isConst) return NO('map-callback preamble declares a mutable binding (let/var)')
    for (const decl of stmt.declarationList.declarations) {
      collectBindingNames(decl.name, declaredNames)
      if (!decl.initializer) {
        return NO('map-callback preamble has a declaration with no initializer')
      }
      const impure = findImpureNode(decl.initializer, primableNames)
      if (impure) {
        return NO(`map-callback preamble initializer is not re-runnable (${impure})`)
      }
    }
  }

  // `extractFreeIdentifiersFromStatementText` scopes nested binding forms, so
  // the preamble's own `const` names never appear here; deleting them is a
  // belt-and-braces step for a declaration form it might not model.
  // A preamble local that shadows a signal/memo getter would make the
  // call check above answer for the WRONG binding (`const selected = …` then
  // `selected()`). Refuse rather than model shadowing inside the preamble;
  // shadowing across the preamble boundary is handled correctly by
  // `classifyLazyBinding`'s substitution.
  for (const name of declaredNames) {
    if (primableNames.has(name)) {
      return NO(`map-callback preamble shadows the signal/memo getter '${name}'`)
    }
  }

  // The index parameter does not exist in `applyItem` / `applyOuter`, and
  // `createRow` receives it but the preamble must read the same values in
  // every body it runs in. Same reason `referencesIndex` refuses a binding.
  const readNames = extractFreeIdentifiersFromStatementText(text)
  if (readNames.has(indexParam) && !declaredNames.has(indexParam)) {
    return NO(`map-callback preamble reads the loop index parameter '${indexParam}'`)
  }

  const freeNames = new Set(readNames)
  for (const declared of declaredNames) freeNames.delete(declared)

  return { lazySafe: true, facts: { declaredNames, freeNames } }
}

/** Every name a `const` binding form introduces (identifier or pattern). */
function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text)
    return
  }
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue
    collectBindingNames(element.name, out)
  }
}

/**
 * The first node in `root` that makes re-execution observable, described for
 * the refusal reason — or `null` when the expression is provably free to run
 * again. Walks the whole subtree, including into nested array/object literals
 * and template-literal spans.
 */
function findImpureNode(root: ts.Node, primableNames: ReadonlySet<string>): string | null {
  let found: string | null = null

  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const isSignalRead =
        ts.isIdentifier(callee) &&
        primableNames.has(callee.text) &&
        node.arguments.length === 0 &&
        node.questionDotToken === undefined
      if (!isSignalRead) {
        found = `call to ${callee.getText(callee.getSourceFile())}`
        return
      }
      // A zero-arg signal read has no arguments to walk, but keep the
      // traversal uniform rather than returning early.
    }
    if (ts.isNewExpression(node)) { found = 'new expression'; return }
    if (ts.isTaggedTemplateExpression(node)) { found = 'tagged template'; return }
    if (ts.isAwaitExpression(node)) { found = 'await'; return }
    if (ts.isYieldExpression(node)) { found = 'yield'; return }
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
      const op = (node as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression).operator
      if (op === ts.SyntaxKind.PlusPlusToken || op === ts.SyntaxKind.MinusMinusToken) {
        found = 'increment/decrement'
        return
      }
    }
    if (ts.isDeleteExpression(node)) { found = 'delete'; return }
    if (
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isClassExpression(node)
    ) {
      // A closure is a fresh object per run. Nothing in an eligible row can
      // hold onto one (a handler would be an event binding, not a preamble
      // local), but "fresh identity per apply" is exactly the hazard this
      // module exists to exclude, so it is refused rather than reasoned about.
      found = 'function or class expression'
      return
    }
    if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
      found = 'assignment'
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(root)
  return found
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
}
