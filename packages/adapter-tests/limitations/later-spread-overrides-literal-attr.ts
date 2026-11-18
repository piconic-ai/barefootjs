import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A later open attribute spread does not override an earlier literal attribute of the same key',
  given: 'an intrinsic element with a literal attribute followed by a spread whose keys are unknown at compile time (`<annotation-xml encoding="application/x-tex" {...rest}>`, `rest` typed with an index signature)',
  expected: 'the later spread wins and the key renders once (`encoding="text/html"`)',
  actual: 'renders the key twice, the literal first and the spread second, so a browser keeps the literal; the client template keeps only the literal',
  fixtures: ['spread-overrides-literal-attr'],
})
