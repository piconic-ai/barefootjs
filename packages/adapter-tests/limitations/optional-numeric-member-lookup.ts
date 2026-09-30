import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Optional numeric element access misses the array element',
  given: 'an optional array prop read at a literal index (`props.items?.[0] ?? 0`) in conditions and text',
  expected: 'renders the first array element and selects the matching condition branch, or uses the fallback when absent',
  actual: 'renders the fallback for a present element or throws a template syntax, symbol-to-integer conversion, or non-hash-reference error',
  fixtures: ['optional-chain-computed-condition'],
})
