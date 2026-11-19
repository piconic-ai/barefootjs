import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'The props object spread onto an element of a signal-array loop row',
  given: 'a `.map()` over a signal array whose row element spreads the component\'s props (`rows().map((r) => <span key={r.k} {...props}>{r.k}</span>)`)',
  expected: 'every row element carries the keys the caller passed, merged with the row\'s own attributes',
  actual: 'renders the row elements without the keys the props object carries',
  fixtures: ['element-spread-props-in-signal-loop-row', 'element-spread-props-loop-row-live'],
})
