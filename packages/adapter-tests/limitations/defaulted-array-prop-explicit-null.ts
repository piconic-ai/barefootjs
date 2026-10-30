import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An explicit null for a destructured array prop with a default, read through `??` / `||`',
  given:
    'a destructured array prop with its own default (`{ items: rows = [] }`) whose binding seeds a signal through an array-literal fallback (`createSignal(rows ?? [...])`), called with that prop set to `null`',
  expected: 'the default applies only to an omitted prop, so the `null` binding takes the `??` / `||` fallback',
  actual: 'seeds the signal with the destructure default, as for an omitted prop, so the `null` binding never takes the fallback',
  fixtures: ['signal-array-prop-fallback-seed-default'],
})
