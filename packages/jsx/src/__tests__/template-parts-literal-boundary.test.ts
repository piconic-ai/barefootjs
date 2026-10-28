import { expect, test } from 'bun:test'
import { templatePartsToJsExpr } from '../template-parts'
import { parseExpression } from '../expression-parser'

for (const text of ['${notCode}', '`', '\\', '\\${notCode}', '"\'\n\r\t', '']) {
  test(`template text stays literal: ${JSON.stringify(text)}`, () => {
    const source = templatePartsToJsExpr([
      { type: 'string', value: text },
      { type: 'expression', expr: 'value', templateExpr: '_p.value', parsed: parseExpression('value') },
      { type: 'string', value: text },
    ])
    expect(new Function('value', `return ${source}`)('}')).toBe(`${text}}${text}`)
  })
}

test('template expression projection rewrites only the expression part', () => {
  const source = templatePartsToJsExpr([
    { type: 'string', value: '${value} ' },
    { type: 'expression', expr: 'value', templateExpr: '_p.value', parsed: parseExpression('value') },
  ], { useTemplate: true })
  expect(new Function('_p', `return ${source}`)({ value: 'tail' })).toBe('${value} tail')
})

// A `ternary` part carries each branch's COOKED value (`'a\nb'` holds a real
// newline), so the spelling must re-escape it into a valid string literal.
for (const text of ['a\nb', "it's", 'back\\slash', 'tab\tx', 'cr\rlf', 'ls\u2028ps\u2029', '"', '${x}', '`', '']) {
  test(`ternary branch stays a valid literal: ${JSON.stringify(text)}`, () => {
    const source = templatePartsToJsExpr([
      { type: 'ternary', condition: 'on', whenTrue: text, whenFalse: `${text}!` },
    ])
    const evaluate = new Function('on', `return ${source}`)
    expect(evaluate(true)).toBe(text)
    expect(evaluate(false)).toBe(`${text}!`)
  })
}

test('ternary branch without escapes prints unchanged', () => {
  expect(templatePartsToJsExpr([
    { type: 'ternary', condition: 'on', whenTrue: 'a b', whenFalse: 'c' },
  ])).toBe("`${on ? 'a b' : 'c'}`")
})
