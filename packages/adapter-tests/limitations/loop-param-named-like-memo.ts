import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A `.map()` row param named like a memo',
  given: 'a `.map()` callback whose row param has the same name as a memo of the component (`props.rows.map(label => …)` beside `const label = createMemo(…)`)',
  expected: 'the row param shadows the memo inside the row, as in JavaScript',
  actual:
    "throws at render time instead of rendering: the memo compiles to a template-level `my $label`, and Kolon refuses a `for … -> $label` loop variable that redeclares it (`Expected '{', but got '$label'`)",
  fixtures: ['memo-dependency-loop-shadow'],
})
