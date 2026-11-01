import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A comparison over an optional prop typed as a nullable string or boolean',
  given: 'a `<` / `<=` / `>` / `>=` comparison over a string or boolean prop whose type admits both `null` and absence (`s?: string | null`)',
  expected: 'an omitted prop reads as `undefined` (`NaN`, so the comparison is false) and a `null` one as `0`',
  diagnostic: 'BF101',
  fixtures: ['omitted-optional-nullable-string-relational'],
})
