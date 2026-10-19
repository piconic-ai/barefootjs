import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Remainder over a NaN operand',
  given: '`%` whose left operand is `NaN`, such as a signal created with no initial value (`n() % 2`)',
  expected: 'the floating-point remainder: `NaN % 2` is `NaN`',
  actual: 'renders an integer: the engine truncates the `NaN` operand to an integer before taking the remainder',
  fixtures: ['remainder-nan-operand'],
})
