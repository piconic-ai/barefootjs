import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const object or array passed as a child component prop',
  given:
    'a component- or module-scope const holding an object or array literal (`const obj = { n: 1 }`, `const arr = [1, 2]`), passed bare as a child component prop (`<Show token={obj} />`) that the child reads (`props.token.n`, `props.items.length`)',
  expected: 'the child renders the value the const holds (`1`, `2`)',
  actual:
    'renders the child with the prop absent (empty text, `0` for a length), or throws because the template never binds the const',
  fixtures: ['const-object-child-prop-identity', 'const-object-prop-identity-hydrate'],
})
