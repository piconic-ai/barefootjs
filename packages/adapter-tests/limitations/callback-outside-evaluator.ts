import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A higher-order callback outside the template evaluator',
  given: 'a `.sort` / `.map` / `.filter` / `.reduce` callback (or reduce seed) the template evaluator cannot model: an unlowered method call, a string-method predicate, a comparator outside the sort descriptor, a non-literal seed',
  expected: 'the callback runs and its result renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: [
    'sort-opaque-comparator',
    'map-opaque-projection',
    'reduce-nonliteral-seed',
    'filter-opaque-predicate',
    'filter-array-method-predicate',
  ],
})
