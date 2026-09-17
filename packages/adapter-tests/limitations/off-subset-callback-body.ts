import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Off-subset expression in a collection-method callback',
  given: 'a `.filter()` / `.find()` / `.some()` / `.every()` / `.reduce()` / `.flatMap()` callback whose body uses `typeof`',
  expected: 'the callback runs and the result renders in the server HTML',
  diagnostic: ['BF021', 'BF101'],
  fixtures: [
    'filter-typeof-predicate',
    'find-typeof-predicate',
    'some-typeof-predicate',
    'every-typeof-predicate',
    'flatmap-typeof-projection',
    'reduce-typeof-body',
    'reduce-right-typeof-body',
  ],
})
