import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Strict equality between distinct objects or arrays with the same contents',
  given:
    '`===` / `!==` between two distinct objects or arrays whose contents are equal (two props holding `{ id: 1 }`, two elements of `[{ id: 1 }, { id: 1 }]`)',
  expected: 'the comparison is by reference, so `===` is false and `!==` is true',
  diagnostic: 'BF101',
  fixtures: ['strict-equality-distinct-reference'],
})
