import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Empty array as a conditional test',
  given:
    "a ternary whose test is a value that is an empty array (`{tags() ? 'has tags' : 'no tags'}` with `tags()` returning `[]`)",
  expected: 'an empty array is truthy, so the test is true and the first branch renders (`has tags`)',
  actual: 'renders the second branch, treating the empty array as falsy',
  fixtures: ['empty-array-condition'],
})
