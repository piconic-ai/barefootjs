import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Mirrored child-prop attribute appears only after hydration',
  given: 'a non-standard named prop passed to a child component call (`<VariantTag variant={variant()} />`) that the compiler mirrors onto the child root as a DOM attribute',
  expected: 'the server HTML and the hydrated DOM carry the same attributes on the child root',
  actual: 'renders the child root without the attribute in the server HTML; the hydration effect then adds it, so pre- and post-hydration DOM differ',
  fixtures: ['branch-root-prop-attr', 'combobox', 'select', 'pagination', 'data-table'],
})
