import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Attribute state computed in a ref callback or mount effect never reaches SSR',
  given:
    'a component whose real attribute state is computed inside a `ref` callback or a mount effect (context reads, `createEffect`) — a reactive attribute written as a compile-time JSX literal (`aria-expanded`, `aria-checked`, `data-selected`, `data-mounted`), or one the effect adds imperatively with `setAttribute` (`data-placeholder`)',
  expected: 'the server HTML and the hydrated DOM carry the same attribute value',
  actual:
    'renders the compile-time literal (or no attribute at all) in the server HTML — a `ref` callback never runs at SSR — and the first client effect pass then writes the computed value, so pre- and post-hydration DOM differ — a visible snap at the hydrate boundary',
  fixtures: ['accordion', 'radio-group', 'command', 'combobox', 'select'],
})
