import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Computed loop key on component rows built from an array prop',
  given:
    'a component loop row over an array prop keyed by an expression of the row or the index rather than a bare row read (`props.names.map(x => <Item key={x.toString()} label={x} />)`, `key={i.toString()}`)',
  expected: 'every row carries the key value as `data-key`',
  actual:
    'drops `data-key` from every row; a row whose child props are all computed (`label={n.toString()}`) is built from caller-supplied child inputs, which the conformance harness does not supply, so no rows render in the harness',
  fixtures: ['loop-key-to-string', 'loop-key-to-string-number-component-row'],
})
