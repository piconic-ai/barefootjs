import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A fractional number compared against an integer literal fails at render time',
  given:
    'a fractional element of a `number[]` prop compared against an integer literal inside the row (`value > 0` with `value` 1.5)',
  expected: 'the comparison is numeric, as in JavaScript (`1.5 > 0` is true), so the row renders the chosen branch',
  actual:
    'throws at render time instead, because the template engine refuses to compare a floating-point value with an integer ("incompatible types for comparison")',
  fixtures: ['fractional-number-array-row-ops'],
})
