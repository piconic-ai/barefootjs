import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Negated empty array as a conditional test',
  given:
    "a ternary whose test negates a value that is an empty array (`{!tags() ? 'no tags' : 'has tags'}` with `tags()` returning `[]`)",
  expected: "an empty array is truthy, so the test is false and the second branch renders (`has tags`)",
  actual: 'treats the empty array as falsy and renders the first branch',
  fixtures: ['negated-empty-array-condition'],
})
