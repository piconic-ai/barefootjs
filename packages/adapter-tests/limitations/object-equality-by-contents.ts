import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Strict equality between distinct objects or arrays with the same contents',
  given:
    '`===` / `!==` between two distinct objects or arrays whose contents are equal (two props holding `{ id: 1 }`, two elements of `[{ id: 1 }, { id: 1 }]`)',
  expected: 'the comparison is by reference, so `===` is false and `!==` is true',
  actual: 'renders `===` as true and `!==` as false: the comparison is by contents',
  fixtures: ['strict-equality-distinct-reference'],
})
