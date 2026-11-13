import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const object that reads a signal, passed as a child component prop',
  given:
    'a component-scope const holding an object literal whose members read a signal (`const live = { n: count() }`), passed bare as a child component prop (`<Show live={live} />`) that the child reads (`props.live.n`)',
  expected: 'the child renders the value the member has at render time',
  actual:
    'renders the child with the prop absent (empty text, or `0` where the backend has a zero value), or throws because the template never binds the const',
  fixtures: ['signal-const-object-child-prop'],
})
