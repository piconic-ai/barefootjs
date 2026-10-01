import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A loop variable collides with an explicit prop member',
  given: 'a map callback binding the same name as a numeric prop, with an explicit prop member read in a row conditional',
  expected: 'the conditional reads the root prop independently of the row binding',
  actual: 'renders the conditional using the loop-local value instead of the root prop',
  fixtures: ['loop-param-prop-member-collision'],
})
