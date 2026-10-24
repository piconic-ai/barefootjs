import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'String and number joined with `+`',
  given: 'a template expression joining a string and a number with `+` (`r.id + \'-\' + i`)',
  expected: 'the number is stringified and concatenated, as JS `+` does (`x-0`)',
  actual: 'throws at render time: the template language raises a type error adding a string and an integer',
  fixtures: ['loop-row-child-concat-index-key'],
})
