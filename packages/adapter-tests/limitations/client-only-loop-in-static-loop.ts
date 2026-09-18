import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Client-only nested loop inside a static loop row',
  given: 'a static (non-signal) array `.map()` whose row contains a `/* @client */` nested `.map()`',
  expected: 'the outer rows render in the server HTML, each with an empty inner loop host for the client to fill',
  diagnostic: 'BF101',
  fixtures: ['static-loop-client-only-nested'],
})
