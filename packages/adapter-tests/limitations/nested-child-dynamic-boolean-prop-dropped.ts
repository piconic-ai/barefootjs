import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A dynamic boolean prop authored on a nested child component instance is dropped from SSR',
  given:
    "a component that instantiates a sibling-file child component and passes it a boolean prop whose value is a non-literal, reactive expression rather than a literal (e.g. a negated signal read, `showPlaceholder={!value()}`) — the shape ComboboxTrigger's/SelectTrigger's `showPlaceholder` prop uses",
  expected:
    "the child's SSR HTML reflects the prop's real value (the conditional attribute present when the expression is truthy, absent when falsy), matching the caller's actual reactive state",
  actual:
    "drops the prop value before it ever reaches the child's constructor — the child's own template still declares the conditional attribute correctly, but the field goes unpopulated, so the guard is always false and the attribute never renders regardless of the expression's true value",
  fixtures: ['combobox', 'select'],
})
