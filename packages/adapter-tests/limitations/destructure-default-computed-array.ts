import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A destructure default computing an array from an earlier prop',
  given: 'a props destructure default that computes an array from an earlier binding of the same pattern (`{ a, b = a.slice(1) }`, `{ a, b = a.filter((x) => …) }`), in the parameter or a renamed body destructure',
  expected: 'the omitted prop takes the computed array',
  diagnostic: 'BF101',
  fixtures: [
    'destructure-default-body-renamed-computed-array',
    'destructure-default-param-computed-array',
    'destructure-default-body-renamed-callback-earlier',
    'destructure-default-body-renamed-callback-positions',
    'destructure-default-body-renamed-callback-child',
    'destructure-default-body-renamed-callback-shadow',
  ],
})
