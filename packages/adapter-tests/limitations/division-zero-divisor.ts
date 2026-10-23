import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Division by a zero divisor in a template expression',
  given: '`/` in a template expression whose divisor is zero or `null` (`1 / props.zero`)',
  expected: 'IEEE division: `1 / 0` is `Infinity`, `-1 / 0` is `-Infinity`, and `0 / 0` is `NaN`',
  actual: 'renders `0`: the runtime\'s division gives `0` for a zero divisor',
  fixtures: ['number-division-zero-divisor', 'nullish-operand-division-remainder'],
})
