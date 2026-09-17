import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Statement-carrying .map() / .flatMap() callback body',
  given: 'a `.map()` or `.flatMap()` callback whose body is a block with statements (an imperative array builder, a const preamble feeding a leaf, an early return)',
  expected: 'the callback body runs and every row renders in the server HTML',
  diagnostic: 'BF021',
  fixtures: ['map-array-builder-body', 'map-array-builder-escaping', 'tag-cloud', 'preamble-cells'],
})
