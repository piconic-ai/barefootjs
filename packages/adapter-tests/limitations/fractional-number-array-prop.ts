import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Fractional values in a number-array prop',
  given: 'a number-array prop containing fractional values, rendered by a map callback',
  expected: 'the fractional values render unchanged',
  actual: 'emits a number-array initialization rejected by the native renderer with a fractional-to-integer error, without a compiler diagnostic',
  fixtures: ['fractional-number-array-prop'],
})
