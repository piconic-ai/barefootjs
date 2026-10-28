import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: '`JSON.stringify` of a negative zero',
  given: '`JSON.stringify` of the `-0` remainder of a negative integer dividend (`JSON.stringify(n % 2)` for `n = -4`), on its own or inside an array',
  expected: 'JS writes `-0` as `0`: `0`, `[0,1]`',
  actual: 'renders `-0` / `[-0,1]` (or `-0.0` / `[-0.0,1]`): the backend JSON encoder keeps the float\'s sign',
  fixtures: ['remainder-negative-zero-json'],
})
