import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Component loop row with forwarded children over an array prop',
  given:
    'a `.map()` over an array prop of objects whose row is a child component receiving forwarded JSX children that read the row (`props.items.map(item => <Badge key={item.id}>{item.label}</Badge>)`)',
  expected:
    'one component per row, each with its own key and forwarded children (`data-key="a"` … `A`, `data-key="b"` … `B`)',
  actual:
    "renders the loop empty with no diagnostic: the props constructor builds no rows from the array prop (nor from the child's own input rows), and a row slice filled in after construction fails at render time because the row wrapper has no field for the row data the forwarded children read (`can't evaluate field Label`)",
  fixtures: ['loop-row-child-children-prop-array'],
})
