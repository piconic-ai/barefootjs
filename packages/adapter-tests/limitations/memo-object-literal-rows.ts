import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A memo mapping an array to object-literal rows, rendered in a loop',
  given:
    "a memo that maps an array to object literals (`createMemo(() => ROWS.map(r => ({ id: r, k: o.k })))`), rendered by a `.map()` over the memo that reads the rows' members",
  expected: 'every row renders with its members (`av`, `bv`)',
  actual: 'renders no rows',
  fixtures: ['memo-object-rows-read-module-const-member'],
})
