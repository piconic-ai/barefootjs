import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A component-scope const reading a parameter prop whose default is not a primitive literal, in the client template',
  given:
    'a component-scope const read in markup that reads a parameter-destructured prop whose default allocates or names a binding (`{ b = [\'y\'] }`, `{ b = fallback }` beside a body `const fallback`), client-mounted with the prop omitted',
  expected: 'the read renders the default JS binds once in parameter scope (`y`, or the module binding `fallback` names)',
  actual: 'renders empty: the client template reads the omitted prop without its default',
  fixtures: [
    'destructure-default-param-inlined-array-const',
    'destructure-default-param-inlined-const-scope',
  ],
})
