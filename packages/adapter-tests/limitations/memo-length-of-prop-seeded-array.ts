import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: "A memo over the length of a prop-seeded array",
  given:
    'a memo that reads `.length` of a signal seeded from an array prop (`const [items] = createSignal(props.items)`, `createMemo(() => items().length)`), rendered in text',
  expected: 'the memo renders the array\'s length (`2` for a two-item array)',
  actual: 'renders `0`, the zero value of the memo\'s type, whatever the array holds',
  fixtures: ['memo-length-prop-seeded-signal', 'create-query-derived-memo'],
})
