import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest spread after an open spread, missing a key the open bag set',
  given:
    'a literal (`title="fallback"`), then a closed rest spread, an open spread whose bag carries the key (`title`) and the closed rest spread again, where the caller omits the optional key',
  expected: 'the open bag\'s value renders, once (`title="middle"`)',
  actual: 'Renders no attribute: the later expansion writes the omitted key as an explicit `undefined`, which replaces the bag\'s value',
  fixtures: ['spread-closed-rest-repeated'],
})
