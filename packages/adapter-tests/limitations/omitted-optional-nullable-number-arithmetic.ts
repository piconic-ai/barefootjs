import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Arithmetic over an omitted optional prop typed as a nullable number',
  given: 'arithmetic over an optional prop whose type also admits `null` (`n?: number | null`) that the caller omits',
  expected: 'the omitted prop reads as `undefined`, so the result is `NaN`',
  actual: 'renders a number: the omitted prop reads as `0`, as a `null` one does',
  fixtures: ['omitted-optional-nullable-number-arithmetic'],
})
