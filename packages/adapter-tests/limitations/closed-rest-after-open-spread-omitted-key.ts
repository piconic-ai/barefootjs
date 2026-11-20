import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest spread after an open spread, missing a key an earlier write set',
  given:
    'a literal (`title="fallback"`), then a closed rest spread, an open spread and the closed rest spread again, where the caller omits the optional key (`title`) and the open bag lacks it',
  expected: 'the literal renders, since no later spread carries the key (`title="fallback"`)',
  actual: 'Renders no attribute: the later expansion writes the omitted key as an explicit `undefined`, which replaces the literal',
  fixtures: ['spread-closed-rest-repeated'],
})
