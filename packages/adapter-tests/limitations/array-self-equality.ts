import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Strict equality between an object or array and itself',
  given: '`===` / `!==` with the same object or array on both sides (`arr === arr`)',
  expected: '`===` is true and `!==` is false',
  diagnostic: 'BF101',
  fixtures: ['strict-equality-same-reference'],
})
