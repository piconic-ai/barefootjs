import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Strict equality between an object or array and itself',
  given:
    '`===` / `!==` with the same object or array on both sides (`arr === arr`), including in a loop preamble `const` on an element of an optional or nullable object array (`rows[0] === rows[0]`), and through a const that aliases an object const or holds it in a member (`C === B` with `const C = B`, `B.a === A` with `const B = { a: A }`)',
  expected: '`===` is true and `!==` is false',
  diagnostic: 'BF101',
  fixtures: [
    'strict-equality-same-reference',
    'strict-equality-preamble-reference',
    'strict-equality-optional-array-element',
    'strict-equality-nullable-array-element',
    'module-const-literal-identity',
    'const-literal-identity-positions',
    'component-const-prop-object-identity',
    'module-const-alias-identity',
    'module-const-member-alias-identity',
  ],
})
