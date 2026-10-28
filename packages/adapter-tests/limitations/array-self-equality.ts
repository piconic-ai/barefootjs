import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Strict equality between an array and itself',
  given: '`===` / `!==` with the same array on both sides (`arr === arr`)',
  expected: '`===` is true and `!==` is false',
  actual: 'renders `===` as false and `!==` as true',
  fixtures: ['strict-equality-same-reference'],
})
