import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Array.prototype.fill in a template expression',
  given: 'a template expression calling `.fill(value)` on an array',
  expected: 'the filled array renders in the server HTML',
  diagnostic: 'BF101',
  fixtures: ['fill-unsupported'],
})
