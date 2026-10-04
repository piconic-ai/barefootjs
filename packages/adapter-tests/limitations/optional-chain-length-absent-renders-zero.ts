import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A bare optional-chained `.length` over an absent array renders `0`',
  given: 'an optional-chained `.length` read rendered as text with no fallback, over an absent array (`{props.items?.length}` with `items` undefined)',
  expected: 'the read is `undefined`, so nothing renders',
  actual: 'renders `0`, the length of an empty array',
  fixtures: ['optional-chain-length-bare-text'],
})
