import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `.map()` param named like a template-level local overwrites it after the loop',
  given:
    'a `.map((label, i) => …)` callback whose params have the same names as component memos read after the loop (`const i = createMemo(() => n() * 2)` and `data-i={i()}` below the loop)',
  expected: 'the params shadow the memos only inside the row; the reads after the loop render the memos (`data-i="10"`)',
  actual:
    'renders the last row values after the loop (`data-i="1"`): the index binds with a template-level `set` inside the loop body (Pebble, Twig), and PHP `foreach` also binds the item param in the template scope (Blade), so they overwrite the memos of the same names',
  fixtures: ['memo-loop-param-collision'],
})
