import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Dividing by the -0 remainder of a negative integer dividend',
  given: '`/` in a template expression whose divisor is the zero remainder of a negative integer dividend (`1 / (n % 2)` for `n = -4`)',
  expected: 'JS gives `-4 % 2` as `-0`, so the quotient is `-Infinity`',
  actual: 'renders `Infinity`: the remainder is an integer `0` that has lost the sign',
  fixtures: ['remainder-negative-zero-quotient'],
})
