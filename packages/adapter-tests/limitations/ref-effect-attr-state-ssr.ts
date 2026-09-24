import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Attribute state computed in a ref callback or mount effect never reaches SSR',
  given:
    'a component whose real attribute state is computed inside a `ref` callback or a mount effect (context reads, `createEffect`) — a reactive attribute written as a compile-time JSX literal (`aria-expanded`, `aria-checked`, `data-selected`, `data-mounted`), or one the effect adds imperatively with `setAttribute` (`data-placeholder`)',
  expected: 'the server HTML and the hydrated DOM carry the same attribute value',
  actual:
    'renders the compile-time literal (or no attribute at all) in the server HTML — a `ref` callback never runs at SSR — and the first client effect pass then writes the computed value, so pre- and post-hydration DOM differ — a visible snap at the hydrate boundary',
  // accordion / radio-group / command / combobox / select graduated
  // (#3065) for the ATTRIBUTE half of this mechanism: all five now
  // thread the parent-known initial state down as an explicit,
  // compiler-analyzable prop (AccordionTrigger's `open`,
  // RadioGroupItem's `defaultChecked`, CommandItem's `defaultSelected` +
  // `value`, ComboboxTrigger's/SelectTrigger's `showPlaceholder`,
  // ComboboxItem's `defaultSelected`) instead of a hard-coded literal or
  // an imperative `setAttribute`, mirroring the carousel precedent
  // (data-orientation). `ref-mount-attr` is a minimal, component-agnostic
  // fixture pinning the underlying mechanism itself, added once none of
  // the named UI components exhibited it anymore — the general shape is
  // still real (the pairwise sweep's `…event-ref-callback…` rows
  // reproduce the same `data-mounted` shape independently, on generated
  // cases outside this corpus).
  fixtures: ['ref-mount-attr'],
})
