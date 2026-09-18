import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Combobox/Select placeholder styling attribute appears only after hydration',
  given:
    "a `ComboboxValue`/`SelectValue` whose `ref` callback runs a `createEffect` that imperatively calls `trigger.setAttribute('data-placeholder', '')` on its trigger ancestor whenever no value is selected — an application-level DOM-query effect, not a compiler-generated binding",
  expected: 'the server HTML and the hydrated DOM carry the same `data-placeholder` presence on the trigger',
  actual:
    "renders the trigger without `data-placeholder` in the server HTML; the ref effect runs once on hydrate and unconditionally adds it whenever no value is selected, so pre- and post-hydration DOM differ",
  fixtures: ['combobox', 'select'],
})
