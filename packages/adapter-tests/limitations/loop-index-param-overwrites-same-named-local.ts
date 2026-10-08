import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `.map()` param named like a template-level local overwrites it after the loop',
  given:
    'a `.map((label, i) => …)` or `.map(({ name }, count) => …)` callback whose params have the same names as a memo, signal or prop read after the loop (`const i = createMemo(() => n() * 2)` and `data-i={i()}` below the loop)',
  expected:
    'the params shadow the outer names only inside the row; the reads after the loop render the outer values (`data-i="10"`)',
  actual:
    'renders the last row values after the loop (`data-i="1"`): the index and destructure bindings are template-level `set`s inside the loop body (Twig), and PHP `foreach` also binds the item param in the template scope (Blade), so they overwrite the outer values of the same names',
  fixtures: ['memo-loop-param-collision', 'loop-set-bound-param-shadow'],
})
