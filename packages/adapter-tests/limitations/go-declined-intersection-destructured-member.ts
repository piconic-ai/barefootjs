import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructured prop typed as an inline intersection with an open constituent',
  given:
    'a destructured prop typed as an inline intersection whose constituent declares an index signature (`({ data }: { data: A & B })` with `type A = { [key: string]: string }`), read by a declared property (`data.label`)',
  expected: 'the declared member value (`label:extra`)',
  actual:
    'renders an empty string for the declared member, since the prop is an `interface{}` field holding the source-keyed map and the read is a capitalised dot path',
  fixtures: ['intersection-member-index-signature-destructured'],
})
