import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const reading a prop whose destructure has a default',
  given:
    'a component-scope const aliasing (`const a = label`) or computed from (`const L = a + \'!\'`) a prop destructured with a default (`{ label = \'d\' }`), rendered with the prop omitted',
  expected: 'the read renders the default',
  actual: 'renders empty: the read takes the passed prop without its default',
  fixtures: ['const-alias-default-prop-loop-shadow', 'destructure-default-local-const-prop-hop'],
})
