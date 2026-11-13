import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const with a non-literal initializer passed as a child component prop',
  given:
    'a component-scope const whose initializer is not a static literal (`const made = new Map()`, `const fn = () => obj.n`), passed bare as a child component prop the child does not render',
  expected: 'the page renders; the child markup does not depend on the prop',
  actual: 'throws while rendering the parent, because the template reads the const as a variable it never declares',
  fixtures: ['const-object-prop-identity-hydrate'],
})
