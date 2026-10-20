import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Division by a zero divisor in a template expression',
  given: '`/` in a template expression whose divisor is zero (`1 / props.zero`), including the `-0` remainder of a negative dividend (`1 / (n % 2)` for `n = -4`)',
  expected: 'IEEE division: `1 / 0` is `Infinity`, `-1 / 0` and `1 / -0` are `-Infinity`, and `0 / 0` is `NaN`',
  actual: 'renders `0`, or the render fails: the engine\'s `/` raises on a zero divisor',
  fixtures: ['number-division-zero-divisor', 'remainder-negative-zero-quotient'],
})
