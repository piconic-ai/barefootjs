import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Computed loop key on component rows built from caller-supplied child inputs',
  given:
    'a component loop row over an array prop that passes a child prop computed from the row (`label={n.toString()}`), keyed by a computed expression of the row that no child prop carries as a plain row read (`key={n.toString()}`)',
  expected: 'every row carries the key value as `data-key`',
  diagnostic: 'BF101',
  fixtures: ['loop-key-to-string-number-component-row'],
})
