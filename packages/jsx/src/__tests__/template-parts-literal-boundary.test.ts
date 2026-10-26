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
