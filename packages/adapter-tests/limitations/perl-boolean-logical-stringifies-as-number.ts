import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A stringified && / || over a boolean prop renders 1 on the Perl adapters',
  given: 'a stringified `&&` / `||` whose operands mix a boolean prop with a computed boolean (`String(props.on && !props.off)`)',
  expected: 'it renders `true` / `false`',
  actual: 'renders `1`: Perl returns the last evaluated operand, a native `1` from `!` or a comparison, and a boolean-typed identifier operand does not mark the expression as boolean',
  fixtures: ['boolean-logical-stringify'],
})
