import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A nested component inside a named JSX prop',
  given: 'a named JSX prop whose element contains a nested component, alongside forwarded children',
  expected: 'the named prop renders its element and nested component, and the forwarded children render normally',
  actual: 'throws a missing-child-field error during rendering, or replaces the named prop markup with escaped text during hydration',
  fixtures: ['jsx-prop-template-delimiters'],
})
