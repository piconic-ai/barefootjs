import { exprToString, type ParsedExpr } from '../expression-parser.ts'
import {
  ambiguousNilArithmeticOperands,
  arithmeticOperandCoercion,
  arithmeticOperandNilIsAmbiguous,
  type ArithmeticCoercion,
  type NullishAttrContext,
} from '../nullable-signal-attr.ts'
import { BindingScope } from '../scope/binding-scope.ts'
import type { CompilerError, MemoInfo } from '../types.ts'

/**
 * Where a template adapter records the refusal of an arithmetic operand
 * whose nil the declared type cannot classify (#3700).
 */
export interface AmbiguousNilArithmeticSink {
  readonly errors: CompilerError[]
  readonly componentName: string
}

/**
 * The shared arithmetic-operand decision for a template adapter's emission
 * site: the coercion the adapter spells (`arithmeticOperandCoercion`), after
 * refusing (BF101) an operand that reads a number prop declared both
 * optional and nullable (`n?: number | null`, `arithmeticOperandNilIsAmbiguous`).
 * JS reads that prop as `undefined` when omitted (`NaN` in arithmetic) and
 * as `0` when `null`; the engine holds both as one nil, so any spelling
 * renders one of them wrong. Asked at the emission site so the operand is
 * classified in the scope it is read in (`isShadowed`). One error per
 * operand text per compile.
 */
export function arithmeticCoercionOrRefuse(
  op: string,
  operand: ParsedExpr,
  other: ParsedExpr | undefined,
  ctx: NullishAttrContext,
  isShadowed: (name: string) => boolean,
  sink: AmbiguousNilArithmeticSink,
): ArithmeticCoercion {
  if (arithmeticOperandNilIsAmbiguous(op, operand, other, ctx, isShadowed)) {
    recordAmbiguousNilArithmetic(exprToString(operand), sink)
  }
  return arithmeticOperandCoercion(op, operand, other, ctx, isShadowed)
}

/**
 * Refuse (BF101) each arithmetic operand in a whole expression that a
 * template adapter lowers without asking {@link arithmeticCoercionOrRefuse}
 * per operator: a `.filter()` predicate, an expression the runtime evaluator
 * runs, a condition lowered by its own renderer (`ambiguousNilArithmeticOperands`).
 * `scope` is the scope the expression is read in.
 */
export function refuseAmbiguousNilArithmetic(
  expr: ParsedExpr,
  ctx: NullishAttrContext,
  scope: BindingScope,
  sink: AmbiguousNilArithmeticSink,
): void {
  for (const operand of ambiguousNilArithmeticOperands(expr, ctx, scope)) {
    recordAmbiguousNilArithmetic(exprToString(operand), sink)
  }
}

/**
 * Refuse the ambiguous arithmetic in the component's memo bodies. A template
 * adapter seeds every memo at SSR, and some seed a memo through a path that
 * never reaches its operator emitter (a static seed after a speculative
 * lowering, a constructor-time evaluation), so the bodies are checked as a
 * whole, in the component scope they are declared in.
 */
export function refuseAmbiguousNilMemoArithmetic(
  memos: readonly MemoInfo[],
  ctx: NullishAttrContext,
  sink: AmbiguousNilArithmeticSink,
): void {
  for (const memo of memos) {
    if (memo.parsed) refuseAmbiguousNilArithmetic(memo.parsed, ctx, BindingScope.EMPTY, sink)
  }
}

function recordAmbiguousNilArithmetic(operandText: string, sink: AmbiguousNilArithmeticSink): void {
  const message = `Arithmetic over \`${operandText}\` reads a number prop declared both optional and nullable (\`?: number | null\`). JS reads it as \`undefined\` when the caller omits it (\`NaN\` in arithmetic) and as \`0\` when it is \`null\`, but a template engine holds both as the same nil, so the server render cannot tell which one it is.`
  if (sink.errors.some(e => e.code === 'BF101' && e.message === message)) return
  sink.errors.push({
    code: 'BF101',
    severity: 'error',
    message,
    loc: { file: `${sink.componentName}.tsx`, start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    suggestion: {
      message: 'Declare the prop as only optional (`?: number`) or only nullable (`: number | null`), or give it a default value.',
      escape: [{ kind: 'rewrite' }],
    },
  })
}
