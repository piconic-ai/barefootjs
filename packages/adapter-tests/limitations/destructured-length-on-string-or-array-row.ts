import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructured `length` off a string or array row',
  given: 'a `.map()` callback that destructures `length` off each row (`({ length }) => …`) where the rows are strings or arrays',
  expected: "each row reads its own length: a string's UTF-16 code-unit count, an array's element count (`'abc'` gives `3`, `['x', 'y']` gives `2`)",
  actual: 'renders every row\'s `length` empty (and a `key={length}` as `data-key=""`), with no diagnostic, or fails the render',
  fixtures: ['destructure-length-in-map'],
})
