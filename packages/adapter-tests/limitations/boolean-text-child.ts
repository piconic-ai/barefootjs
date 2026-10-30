import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A boolean as a text child',
  given:
    'a text child whose value is a boolean: a boolean prop read directly, or a `true` / `false` that `??`, `&&` or a ternary branch returns, in a loop row too, or a `boolean | string` prop rendered as a text child',
  expected: 'nothing renders: JSX renders no `true` / `false` child',
  actual: 'renders `true` / `false` as text',
  fixtures: ['boolean-text-child', 'boolean-text-child-destructured'],
})
