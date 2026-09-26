import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Component loop row keyed by the row value of a scalar array prop',
  given:
    'a `.map()` over an array prop of strings whose row is a child component with no children, keyed by the row value itself rather than a field of it (`props.items.map(i => <Badge key={i} label={i} />)`)',
  expected: 'one component per row, each with its own key and prop (`data-key="a"` … `a`, `data-key="b"` … `b`)',
  actual:
    "renders every row without its `data-key`: the props constructor only takes a row key from a field of each row's child-component input, and the row value itself is not one",
  fixtures: ['loop-row-child-scalar-row-key'],
})
