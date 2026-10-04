import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "Component loop row with forwarded children over an array prop that a sibling loop's plural shadows",
  given:
    "a `.map()` over an array prop whose row is a child component with forwarded children (`props.items.map(row => <Badge key={row.id}>{row.meta.label}</Badge>)`), next to another component loop whose child's plural is that prop's Go field name (`props.other.map(row => <Item … />)` → `Items`)",
  expected:
    'one component per row in both loops (`data-key="a"` … `A`, `data-key="b"` … `B`, and the `<Item>` rows)',
  actual:
    "renders the forwarded-children loop empty with no diagnostic: the sibling loop's `Items []ItemInput` Input field takes the prop's own `Items` field, so the constructor has no datum slice to build the `<Badge>` rows from",
  fixtures: ['loop-row-child-children-prop-array-sibling-plural'],
})
