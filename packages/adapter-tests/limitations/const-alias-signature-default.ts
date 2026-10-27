import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const alias of a prop whose signature destructure has a default',
  given:
    'a component-scope const alias (`const a = label`) of a prop the signature destructures with a default (`{ label = \'d\' }`), rendered with the prop omitted',
  expected: 'the read renders the default',
  actual: 'renders empty: the read takes the passed prop without its default',
  fixtures: ['const-alias-default-prop-loop-shadow'],
})
