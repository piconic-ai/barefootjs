import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Nested higher-order callback inside a filter predicate',
  given: 'a `.filter()` predicate whose body calls `.some()` / `.find()` with its own arrow callback',
  expected: 'the filtered rows render in the server HTML with the nested predicate applied',
  diagnostic: 'BF101',
  fixtures: ['filter-nested-callback-predicate', 'filter-nested-find-predicate'],
})
