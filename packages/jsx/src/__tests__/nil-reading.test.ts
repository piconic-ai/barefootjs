/**
 * The nil-reading rewrite (#3824 step 4a, `spec/js-primitive-semantics.md`
 * "Nil reading is a tree rewrite"): an operand whose nil Phase 1 can read is
 * made non-nil before the plan, by its consumer's coercion.
 */
import { describe, test, expect } from 'bun:test'
import {
  analyzeComponent,
  buildMetadata,
  collectOperandTyping,
  rewriteNilReadings,
  rewriteNilReadingsDeep,
  parseExpression,
  serializeParsedExpr,
  stringifyParsedExpr,
  BindingScope,
  type ParsedExpr,
} from '../index'

const SRC = `export function C(props: { n?: number; nn: number | null; e?: number | null; s?: string; sn: string | null; c?: string | null; m: number; t: string; x: any }) { return <p>{props.m}</p> }`

function typing() {
  const metadata = buildMetadata(analyzeComponent(SRC, 'c.tsx'))
  return collectOperandTyping(metadata).at(BindingScope.forComponent(metadata.propsObjectName))
}

/** `e` with every operator node parenthesised, so the tests read the tree's grouping. */
function show(e: ParsedExpr): string {
  switch (e.kind) {
    case 'binary':
    case 'logical':
      return `(${show(e.left)} ${e.op} ${show(e.right)})`
    case 'unary':
      return `${e.op}${show(e.argument)}`
    case 'literal':
      return e.literalType === 'string' ? `'${e.value}'` : String(e.value)
    case 'template-literal':
      return '`' + e.parts.map(p => (p.type === 'string' ? p.value : `\${${show(p.expr)}}`)).join('') + '`'
    default:
      return stringifyParsedExpr(e)
  }
}

const rewrite = (src: string): string => show(rewriteNilReadings(parseExpression(src), typing()))

describe('rewriteNilReadings', () => {
  test('a numeric consumer reads an undefined nil as NaN and a null one as 0', () => {
    expect(rewrite('props.n * 2')).toBe('((props.n ?? NaN) * 2)')
    expect(rewrite('props.nn - props.m')).toBe('((props.nn ?? 0) - props.m)')
    expect(rewrite('-props.n')).toBe('-(props.n ?? NaN)')
    expect(rewrite('props.s < props.t')).toBe('((props.s ?? NaN) < props.t)')
  })

  test('a string consumer reads it as "undefined" / "null"', () => {
    expect(rewrite("props.s + '!'")).toBe("((props.s ?? 'undefined') + '!')")
    expect(rewrite("props.t + props.sn")).toBe("(props.t + (props.sn ?? 'null'))")
    expect(rewrite('`${props.n}`')).toBe("`${(props.n ?? 'undefined')}`")
    expect(rewrite("null + 'x'")).toBe("('null' + 'x')")
  })

  test('a string operand under + number is split on nil by the numeric row', () => {
    expect(rewrite('props.s + 1')).toBe('((props.s ?? NaN) + 1)')
  })

  test('an either nil keeps the display reading, and a dynamic + is left alone', () => {
    expect(rewrite('(props.e * 2)')).toBe('(props.e * 2)')
    expect(rewrite("'btn ' + props.c")).toBe("('btn ' + (props.c ?? ''))")
    expect(rewrite('(props.n + props.x)')).toBe('(props.n + props.x)')
  })

  test('the deep form enters callbacks and serializes NaN through Number', () => {
    const deep = rewriteNilReadingsDeep(parseExpression('props.items.filter(i => i > props.n)'), typing())
    const arrow = deep.kind === 'call' ? deep.args[0] : undefined
    expect(arrow?.kind === 'arrow' ? show(arrow.body) : null).toBe('(i > (props.n ?? NaN))')
    expect(serializeParsedExpr(rewriteNilReadings(parseExpression('props.n * 2'), typing()))).toContain('"name":"Number"')
  })
})
