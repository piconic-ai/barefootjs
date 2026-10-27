import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A signal-array loop whose row is a child component with forwarded JSX children",
  given:
    "a `.map()` over a signal's array whose row is a child component receiving JSX children (`rows().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)`), rendered at SSR",
  expected: "one child component per array item, each with its forwarded children, from the signal's initial value",
  actual: 'renders the loop container with no rows',
  fixtures: [
    'signal-loop-row-child-children',
    'loop-row-child-children-inner-loop-shadow',
    'loop-row-child-children-handler',
    'loop-row-child-children-ref',
    'loop-row-child-children-inner-loop-handler',
  ],
})
