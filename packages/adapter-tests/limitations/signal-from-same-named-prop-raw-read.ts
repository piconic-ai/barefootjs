import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Raw prop read beside a signal seeded from the same-named prop',
  given: 'a bare-props component with a signal named like a prop and seeded from that prop (`const [label] = createSignal(props.label ?? \'D\')`) that also reads `props.label`',
  expected: '`props.label` renders the caller\'s value, empty when the caller omits it',
  actual: 'renders the signal\'s derived value for `props.label` (`D` when the caller omits the prop)',
  fixtures: ['signal-from-same-named-prop-raw-read'],
})
