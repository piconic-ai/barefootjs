import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Strict equality between arrays read through a component-scope const',
  given:
    '`===` between arrays read through a component-scope const (`const local = [b, b]; local[0] === local[1]`), where the arrays are a parameter prop with an array default and a later default reading it (`{ a = [], c = a }`), passed or omitted',
  expected: '`===` compares by reference: one binding read twice is `true`, two distinct arrays with equal contents are `false`',
  actual: 'renders the comparison by the arrays\' contents, or with each copy of the default read as a distinct array',
  fixtures: ['destructure-default-param-inlined-const-identity'],
})
