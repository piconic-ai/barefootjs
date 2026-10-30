import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Relational comparison between a string and a number',
  given: '`<` / `>` / `<=` / `>=` with a string operand and a number operand (a string prop compared with `0`)',
  expected: 'the string is converted to a number first, so `\'-2.0\' < 0` is true and `\'1e5\' < 0` is false',
  actual: 'throws a type error at render time, or renders the comparison without converting the string (`\'-2.0\' < 0` is false)',
  fixtures: ['json-stringify-compared-string-prop'],
})
