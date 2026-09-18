import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A child-component prop whose value is a ternary with an undefined alternate is dropped from the slot props',
  given:
    'a child component call whose prop is a ternary with an `undefined` alternate (`<RestForwardTag tag={shown() ? tag() : undefined} />`), the child forwarding that prop onto its root via `{...rest}`',
  expected: 'the server HTML carries `tag="one"` while the branch is taken and no `tag` attribute otherwise, as the reference renders',
  actual:
    'omits the prop from the generated slot props (`RestForwardTagInput{ Variant: "a" }`, no `Tag`), so the child’s rest-bag lookup renders `tag=""` whichever branch is taken',
  fixtures: ['child-prop-rest-forward'],
})
