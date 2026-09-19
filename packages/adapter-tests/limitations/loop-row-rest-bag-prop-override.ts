import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Per-row prop routed into a child rest bag inside a composite loop row',
  given: 'a signal-driven `.map()` whose row root is a plain element wrapping a child component, passing a per-row value through a prop the child captures only via `...rest`',
  expected: 'each row renders the child with that row\'s value applied (`title="one"`, `title="two"`)',
  actual: 'renders the child without the rest-bag attribute at all, on every row',
  fixtures: ['composite-row-child-rest-bag-prop'],
})
