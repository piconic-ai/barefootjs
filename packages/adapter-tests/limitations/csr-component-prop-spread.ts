import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A props spread onto a child component next to explicit props in the client template',
  given:
    'a child component call that spreads the props object next to explicit props (`<Child {...props} tone="x" />`, `<Child tone="x" {...props} />`), rendered by the client template',
  expected:
    'the child receives the merged props in source order: a later explicit prop overrides the spread, a later spread overrides an earlier explicit prop for the keys it carries',
  actual: 'drops the spread and passes only the explicit props, so its keys neither reach the child nor override an earlier explicit prop',
  fixtures: ['component-spread-props-then-explicit', 'component-spread-explicit-then-props'],
})
