import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Strict equality between an object or array and itself',
  given:
    '`===` / `!==` with the same object or array on both sides (`arr === arr`), including in a loop preamble `const` and on an element of an optional or nullable object array (`rows[0] === rows[0]`)',
  expected: '`===` is true and `!==` is false',
  diagnostic: 'BF101',
  fixtures: [
    'strict-equality-same-reference',
    'strict-equality-preamble-reference',
    'strict-equality-optional-array-element',
    'strict-equality-nullable-array-element',
  ],
})
