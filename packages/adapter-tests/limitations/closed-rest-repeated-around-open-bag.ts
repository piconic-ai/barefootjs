import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest spread repeated around an open spread',
  given:
    'an earlier write of a key (a literal), then the same closed rest spread before and after an open spread (`{...rest} {...bag} {...rest}`)',
  expected: 'the key renders once, with the last write JS makes: the rest\'s value, else the bag\'s, else the earlier write',
  actual:
    'Renders the rest\'s value twice ahead of the bag\'s when both carry the key, or drops the earlier write because the later expansion writes the omitted key as `undefined`',
  fixtures: ['spread-closed-rest-repeated-around-bag', 'spread-closed-rest-repeated-both'],
})
