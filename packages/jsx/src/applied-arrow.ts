/**
 * `(() => body)()`: a zero-param, synchronous arrow literal with an
 * expression body, called with no arguments where it is written. Evaluating
 * the call evaluates `body` in the scope it is written in, so one evaluation
 * of the call and one of `body` are the same.
 *
 * Two places ask about this shape, and both get their answer here:
 *
 *   - the CSR template check (`relocate.ts`), which accepts the call in a
 *     const it splices at every read site (#3975);
 *   - the analyzer (`analyzer.ts`), which records a const initialized by the
 *     call as initialized by its body (`repeatableAppliedArrowValue`, #4022),
 *     so every consumer of the const decides on the body it would decide on
 *     for `const B = body`.
 *
 * Both splice or substitute the body where the source evaluated the call
 * once, so a body that samples a value (`Math.random()`, `Date.now()`,
 * `new Date()`) is never accepted: two evaluations would differ
 * (`isRepeatableBody`).
 */

import ts from 'typescript'

function unwrapParens(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unwrapParens(node.expression) : node
}

/** The expression body of `call` when it is `(() => body)()` with a synchronous arrow, else null. */
function appliedZeroParamArrowBody(call: ts.CallExpression): ts.Expression | null {
  if (call.arguments.length !== 0 || call.questionDotToken) return null
  const callee = unwrapParens(call.expression)
  if (!ts.isArrowFunction(callee) || callee.parameters.length !== 0 || ts.isBlock(callee.body)) return null
  if (callee.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) return null
  return callee.body
}

/**
 * Verdicts per call node. The walks that ask (`hasZeroArgCall`,
 * `hasCallWithBridgedArg` in `relocate.ts`) also descend into an accepted
 * call's body and ask again for each nested applied arrow, so without this a
 * chain of helpers spliced into one another (`h2 = () => h1()`, …) re-walked
 * every inner body once per enclosing call. Keyed weakly by the parsed node:
 * a fresh parse starts fresh.
 */
const appliedArrowVerdicts = new WeakMap<ts.CallExpression, boolean>()

/**
 * `(() => body)()` whose body evaluates to the same value each time
 * (`isRepeatableBody`). Accepting the call does not vouch for `body`'s own
 * reads: the caller still resolves them as it would in `body` written in
 * place.
 */
export function isAppliedZeroParamArrow(call: ts.CallExpression): boolean {
  const cached = appliedArrowVerdicts.get(call)
  if (cached !== undefined) return cached
  const body = appliedZeroParamArrowBody(call)
  const verdict = body !== null && isRepeatableBody(body)
  appliedArrowVerdicts.set(call, verdict)
  return verdict
}

/**
 * Whether evaluating `node` again yields the same value: it calls nothing but
 * another applied zero-param arrow of the same kind, constructs nothing
 * (`new`), runs no tag function and builds no JSX. Reads, operators and
 * literals repeat. Each node is visited once: an accepted call's verdict
 * already covers its body, so the walk does not descend into it again.
 */
function isRepeatableBody(node: ts.Node): boolean {
  if (ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) return false
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return false
  if (ts.isCallExpression(node)) return isAppliedZeroParamArrow(node)
  return ts.forEachChild(node, child => (isRepeatableBody(child) ? undefined : true)) !== true
}

/**
 * `node` without parentheses and type assertions (`as T`, `satisfies T`),
 * which change nothing about the value: `ConstantInfo.value` is the
 * type-stripped JS, and `typedValue` keeps the source as written.
 */
function unwrapValueWrappers(node: ts.Expression): ts.Expression {
  let inner = node
  while (ts.isParenthesizedExpression(inner) || ts.isAsExpression(inner) || ts.isSatisfiesExpression(inner)) inner = inner.expression
  return inner
}

/** At most this many applied arrows are peeled off one initializer. */
const MAX_APPLIED_ARROW_DEPTH = 16

/**
 * The expression a const initialized by `init` holds when `init` is an
 * applied zero-param arrow with a repeatable body (`(() => ({ k: V }))()`,
 * also inside parentheses or a type assertion, or nested, `(() => (() =>
 * V)())()`): its innermost body. Null for every other initializer, including
 * an arrow with a block body, parameters, `async`, or a body that samples a
 * value.
 *
 * A `const` evaluates its initializer once, and so does a `const` of the
 * body, so the two hold the same value.
 */
export function repeatableAppliedArrowValue(init: ts.Expression): ts.Expression | null {
  let value: ts.Expression | null = null
  let current = unwrapValueWrappers(init)
  for (let depth = 0; depth < MAX_APPLIED_ARROW_DEPTH; depth++) {
    if (!ts.isCallExpression(current) || !isAppliedZeroParamArrow(current)) break
    value = appliedZeroParamArrowBody(current)
    if (value === null) break
    current = unwrapValueWrappers(value)
  }
  return value
}

/**
 * Whether `init` (parentheses and type assertions removed) calls a function
 * literal where it stands: an arrow or a function expression as the callee,
 * whatever its parameters, arguments or body (`(() => { … })()`,
 * `((x) => x)(v)`, `(function () { … })()`).
 */
export function isFunctionLiteralCall(init: ts.Expression): boolean {
  const inner = unwrapValueWrappers(init)
  if (!ts.isCallExpression(inner)) return false
  const callee = unwrapParens(inner.expression)
  return ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)
}
