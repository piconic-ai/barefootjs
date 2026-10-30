import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A props spread onto a child component in a static-array loop row',
  given:
    'a `.map()` over a local constant array whose row is a child component that spreads the props object (`fixed.map((it) => <Child key={it} size="s" {...props} label={it} />)`)',
  expected: "each row's child receives the caller's keys, merged with the call's explicit props in source order",
  actual: "drops the spread: each row's child receives only the call's explicit props",
  fixtures: ['component-spread-props-in-static-loop-row'],
})
