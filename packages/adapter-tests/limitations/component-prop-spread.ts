import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A props spread onto a child component',
  given: 'a child component call that spreads an object (`<Child {...props} />`, `<Child {...rest} />`), alone or next to explicit props',
  expected: 'the child receives the merged props in source order: a later explicit prop overrides the spread, a later spread overrides an earlier explicit prop for the keys it carries',
  actual:
    'drops the spread when the call also passes explicit props (or always), or lets a key the spread omits erase an earlier explicit prop',
  fixtures: ['component-spread-rest', 'component-spread-props-then-explicit', 'component-spread-explicit-then-props'],
})
