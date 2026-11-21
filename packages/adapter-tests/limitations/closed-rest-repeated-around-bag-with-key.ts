import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest spread repeated around an open bag that carries the same key',
  given:
    'the same closed rest spread before and after an open spread (`{...rest} {...bag} {...rest}`), where both the caller and the open bag supply the key (`title`)',
  expected: 'the rest\'s value renders, once (`title="last"`)',
  actual: 'Renders the open bag\'s value, alone or after the rest\'s (`title="last" title="middle"`)',
  fixtures: ['spread-closed-rest-repeated-both'],
})
