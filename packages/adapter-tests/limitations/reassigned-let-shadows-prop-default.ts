import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A reassigned let that shadows its prop with a default',
  given: "a component-scope `let` that shadows its own prop with a default and is reassigned later (`let label = props.label ?? 'Default'; if (!label) label = 'Fallback'`), with the prop omitted",
  expected: "renders the initializer's value (`Default`)",
  actual: 'the template adapters and the CSR template read the bare prop and render empty text',
  fixtures: ['computed-let-shadows-prop-reassigned-absent'],
})
