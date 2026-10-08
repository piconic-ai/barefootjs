import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An inner `.map()` index named like an outer row binding does not shadow it',
  given:
    'a nested `.map()` whose inner index param has the same name as the outer row\'s destructure binding (`groups.map(({ name, tags }) => … tags.map((t, name) => …{name}…) …{name}…)`)',
  expected:
    'the inner index shadows the binding only inside the inner row (`a0`); the outer row reads its own binding after the inner loop (`g1`)',
  actual:
    'renders the outer binding inside the inner row on go-template (`ag1`), which lowers the destructure binding to the item accessor everywhere, and throws at render on Xslate, where Kolon refuses the inner `my $name` that redeclares the outer one',
  fixtures: ['nested-loop-index-shadows-row-binding'],
})
