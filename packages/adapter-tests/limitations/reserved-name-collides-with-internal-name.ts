import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Reserved name and the internal name it is renamed to',
  given: 'a component that uses both `loop` and `__bf_loop` as names visible at the same point',
  expected: 'each name renders its own value',
  diagnostic: 'BF105',
  fixtures: ['reserved-name-and-internal-twin', 'reserved-name-filter-param-and-internal-prop'],
})
