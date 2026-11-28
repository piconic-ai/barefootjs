import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A memo body reading a `void` expression',
  given: 'a memo body that reads `void <expr>` and falls back from it (`createMemo(() => (void 0) ?? \'a\')`), read on the server',
  expected: 'the read renders the fallback (`a`)',
  actual: 'renders the slot empty',
  fixtures: ['memo-void-nullish-fallback'],
})
