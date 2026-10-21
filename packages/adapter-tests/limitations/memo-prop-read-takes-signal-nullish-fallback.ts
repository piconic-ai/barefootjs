import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A memo reading a prop takes a sibling signal seed’s `??` fallback',
  given: 'a memo that reads an optional prop raw (`createMemo(() => props.b)`, `createMemo(() => props.n * 2)`) beside a signal seeded by `props.b ?? <literal>` / `props.n ?? <literal>`, with the prop omitted',
  expected: 'the memo reads the omitted prop as `undefined`: the bare read renders empty text and the arithmetic renders `NaN`',
  actual: 'renders the signal seed’s fallback literal: the memo reads it in place of the omitted prop',
  fixtures: ['memo-prop-read-beside-signal-nullish-seed'],
})
