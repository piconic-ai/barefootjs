/**
 * The refusal of `===` / `!==` over an operand that may be an object or an
 * array (#3774; `spec/js-primitive-semantics.md`, "Decisions" (4), option
 * (b)).
 *
 * JS compares objects and arrays by reference. A template runtime holds a
 * decoded prop as a value (PHP copy-on-write arrays, Go structs, Ruby and
 * Python containers compared by contents), so no runtime can tell two
 * distinct structures with equal contents apart. Every template adapter
 * therefore refuses the comparison with BF101, as the callback evaluator
 * contract already does (`spec/compiler.md`, "ParsedExpr Evaluator
 * Semantics"). A nullish test (`x === null`, `x === undefined`) is not a
 * strict equality and keeps the target's nil test.
 *
 * The primitive plan names the refusal per node (`mode: 'refuse'`), and
 * every emitter spells the runtime's `strict_eq` for it; the error itself
 * is recorded here, once per component, over every template position, each
 * read in its own scope, and over the memo bodies the adapters seed at SSR.
 */

import { exprToString, type ParsedExpr } from '../expression-parser.ts'
import { parsedExprChildren } from '../action-accessor.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import { walkTemplatePositions } from '../template-position-walk.ts'
import type { ComponentIR, CompilerError, SourceLocation } from '../types.ts'
import type { OperandTyping, ScopedOperandTyping } from './operand-typing.ts'
import { isNullishTest, mayHoldObject } from './primitive-plan.ts'

/** Where a template adapter records the refusal. */
export interface NonPrimitiveEqualitySink {
  readonly errors: CompilerError[]
  readonly componentName: string
}

/** Each `===` / `!==` in `expr` with an operand that may be an object, read in `typing`'s scope. */
function refusedComparisons(expr: ParsedExpr, typing: ScopedOperandTyping, isObjectTypeName: (name: string) => boolean): ParsedExpr[] {
  const found: ParsedExpr[] = []
  const visit = (e: ParsedExpr, at: ScopedOperandTyping): void => {
    if (
      e.kind === 'binary' &&
      (e.op === '===' || e.op === '!==') &&
      !isNullishTest(e.op, e.left, e.right, at) &&
      (mayHoldObject(e.left, at, isObjectTypeName) || mayHoldObject(e.right, at, isObjectTypeName))
    ) {
      found.push(e)
    }
    for (const child of parsedExprChildren(e)) visit(child.expr, child.params ? at.enterCallback(child.params) : at)
  }
  visit(expr, typing)
  return found
}

/**
 * Record BF101 for every `===` / `!==` over an operand that may be an
 * object in `ir`'s template positions and memo bodies. One error per
 * comparison text per compile.
 */
export function refuseNonPrimitiveStrictEquality(ir: ComponentIR, typing: OperandTyping, sink: NonPrimitiveEqualitySink): void {
  const component = BindingScope.forComponent(ir.metadata.propsObjectName ?? null)
  // A named type is an object when the component defines it with fields
  // (`interface Row { … }`, `type Pt = { … }`); a literal union alias is not.
  const objectTypes = new Set(
    (ir.metadata.typeDefinitions ?? []).filter(td => td.properties !== undefined && !td.stringLiteralUnion).map(td => td.name),
  )
  const isObjectTypeName = (name: string): boolean => objectTypes.has(name)
  const check = (expr: ParsedExpr, scope: BindingScope, loc: SourceLocation): void => {
    for (const comparison of refusedComparisons(expr, typing.at(scope), isObjectTypeName)) record(exprToString(comparison), loc, sink)
  }
  walkTemplatePositions(ir.root, ({ expr, loc, scope }) => check(expr, scope ?? component, loc), component)
  for (const memo of ir.metadata.memos ?? []) {
    if (memo.parsed) check(memo.parsed, component, ir.root.loc)
  }
}

function record(comparison: string, loc: SourceLocation, sink: NonPrimitiveEqualitySink): void {
  const message =
    `\`${comparison}\` compares an object or array with \`===\` / \`!==\`. JS compares objects and arrays by reference, ` +
    'but a template engine holds a decoded prop as a value and cannot tell two distinct structures with equal contents apart, ' +
    'so the server render cannot give the JS answer.'
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc,
    suggestion: {
      message:
        'Compare a primitive field instead (`a.id === b.id`), or defer the comparison to the client with /* @client */.',
      escape: [{ kind: 'rewrite' }, { kind: 'client-directive' }],
    },
  })
}
