import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'The same closed rest spread repeated on one element',
  given:
    'an earlier write of a key (a literal), then the same closed rest spread more than once (`{...rest} {...rest}`), adjacent or around an open spread (`{...rest} {...bag} {...rest}`)',
  expected: 'the key renders once, with the last write JS makes: the rest\'s value, else an intervening bag\'s, else the earlier write',
  actual:
    'Renders the key once per expansion (`title="fallback" title="fallback"`), the rest\'s value ahead of the bag\'s, or drops the earlier write because a later expansion writes the omitted key as `undefined`',
  fixtures: [
    'spread-closed-rest-repeated',
    'spread-closed-rest-repeated-last',
    'spread-closed-rest-repeated-around-bag',
    'spread-closed-rest-repeated-both',
    'spread-closed-rest-repeated-after-bag',
  ],
})
