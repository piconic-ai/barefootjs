import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `.map()` index param named like a template-level local overwrites it after the loop',
  given:
    'a `.map((item, i) => …)` callback whose index param has the same name as a component memo read after the loop (`const i = createMemo(() => n() * 2)` and `data-i={i()}` below the loop)',
  expected: 'the index param shadows the memo only inside the row; the read after the loop renders the memo (`data-i="10"`)',
  actual:
    'renders the last row index after the loop (`data-i="1"`): the index binds with a template-level `set` inside the loop body, which overwrites the memo of the same name',
  fixtures: ['memo-loop-param-collision'],
})
