import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Arithmetic over an optional prop typed as a nullable number',
  given: 'arithmetic over a prop whose type admits both `null` and absence (`n?: number | null`)',
  expected: 'an omitted prop reads as `undefined` (`NaN`) and a `null` one as `0`',
  diagnostic: 'BF101',
  fixtures: ['omitted-optional-nullable-number-arithmetic', 'omitted-optional-nullable-number-arithmetic-destructured'],
})
