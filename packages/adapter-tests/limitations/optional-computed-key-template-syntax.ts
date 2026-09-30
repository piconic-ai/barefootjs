import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Optional computed punctuation keys fail to resolve',
  given: "an optional object prop accessed with a literal punctuation-containing key (`props.meta?.['data-x'] ?? 0`) in conditions and text",
  expected: 'renders the stored value and selects the matching condition branch, or uses the fallback when absent',
  actual: 'renders the fallback for a present key or throws a template syntax, undefined-symbol, or invalid-operation error',
  fixtures: ['optional-chain-punctuation-condition'],
})
