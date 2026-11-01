import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Arithmetic or a comparison over an optional prop typed as a nullable number',
  given: 'arithmetic, or a `<` / `<=` / `>` / `>=` comparison, over a prop whose type admits both `null` and absence (`n?: number | null`)',
  expected: 'an omitted prop reads as `undefined` (`NaN`, so a comparison is false) and a `null` one as `0`',
  diagnostic: 'BF101',
  fixtures: [
    'omitted-optional-nullable-number-arithmetic',
    'omitted-optional-nullable-number-arithmetic-destructured',
    'omitted-optional-nullable-number-relational',
  ],
})
