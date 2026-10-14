import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A higher-order callback reading its index or array parameter',
  given: 'a template expression whose `.map` / `.filter` / `.reduce` (or other higher-order) callback reads its index or array parameter',
  expected: "the callback sees each element's index (and the array) and its result renders in the server HTML",
  diagnostic: ['BF021', 'BF101'],
  fixtures: ['callback-index-param', 'filter-index-param-loop'],
})
