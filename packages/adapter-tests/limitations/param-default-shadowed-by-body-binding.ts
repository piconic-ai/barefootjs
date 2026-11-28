import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A parameter default naming a module binding that a body binding shadows, in the client template',
  given:
    'a component-scope const read in markup that reads a parameter-destructured prop whose default names a module binding (`{ b = fallback }`) the body binds again (`const fallback = \'local\'`), client-mounted with the prop omitted',
  expected: 'the read renders the module binding the default names, as JS resolves the default in parameter scope (`module`)',
  actual: 'renders empty: the client template reads the omitted prop without its default',
  fixtures: [
    'destructure-default-param-inlined-const-scope',
  ],
})
