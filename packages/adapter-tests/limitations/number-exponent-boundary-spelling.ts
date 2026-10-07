import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A number at the decimal/exponent notation boundary keeps the host language spelling',
  given:
    'an attribute arithmetic result at 1e-6 or below, or at 1e21 or above (`data-small={props.value / 1e15}` with `value` 1234567890)',
  expected:
    'the JavaScript spelling: decimal within [1e-6, 1e21), otherwise an unpadded lower-case exponent (`0.00000123456789`, `1.23456789e-7`, `1.23456789e+21`)',
  actual:
    'renders the host language spelling: an exponent at 1e-6 (`1.23456789e-6`), a padded (`e-07`) or upper-case (`E+21`) exponent, or the full digits at 1e21',
  fixtures: ['number-arithmetic-attr-exponent-boundaries'],
})
