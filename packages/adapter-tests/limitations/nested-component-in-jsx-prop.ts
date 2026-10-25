import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A nested component inside a named JSX prop',
  given: 'a named JSX prop whose element contains a nested component, alongside forwarded children',
  expected: 'the named prop renders its element and nested component, and the forwarded children render normally',
  actual: 'rendering fails with a missing child field, or hydration replaces the named prop markup with escaped text',
  fixtures: ['jsx-prop-template-delimiters'],
})
