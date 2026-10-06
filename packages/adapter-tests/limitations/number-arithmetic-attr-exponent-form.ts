import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An arithmetic result in an attribute value prints in exponent form',
  given:
    'an attribute whose value is an arithmetic expression with a non-integral result of ten or more digits (`data-sum={props.value + 0.5}` with `value` 1234567890)',
  expected: 'the attribute carries the JavaScript number spelling (`1234567890.5`), as in text position',
  actual: 'renders the value in exponent form (`1.2345678905e+09`)',
  fixtures: ['number-arithmetic-attr-formatting'],
})
