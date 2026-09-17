import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Signal read inside a nested static loop row',
  given: 'a static (non-signal) array `.map()` whose row contains a nested `.map()` reading a signal or memo getter',
  expected: 'both loop levels render in the server HTML with the signal initial value',
  diagnostic: 'BF101',
  fixtures: ['static-nested-loop-ref'],
})
