import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A negated expression passed as a child component prop is dropped from SSR',
  given:
    "a component that renders a child component and passes it a prop whose value is a unary-not expression (`showPlaceholder={!value()}`, `{!open()}`, `{!props.v}`) — the shape ComboboxTrigger's/SelectTrigger's `showPlaceholder` prop uses; the same prop passed a plain signal read or a comparison is not affected",
  expected:
    "the child's SSR HTML reflects the negated value (the conditional attribute present when the expression is truthy, absent when falsy)",
  actual:
    "drops the prop value before it reaches the child — the child's own template still guards the conditional attribute correctly, but its field keeps the zero value, so the attribute never renders regardless of the expression's real value",
  fixtures: ['combobox', 'select'],
})
