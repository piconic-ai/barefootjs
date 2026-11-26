import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'The hydration payload of an open inline intersection member on a named type',
  given:
    'a client component prop of a named object type whose member is an inline intersection with an index-signature constituent (`type Row = { data: A & B }`, `type A = { [key: string]: string }`)',
  expected: 'the payload carries the member\'s keys as the caller wrote them (`{"row":{"data":{"label":"label"}}}`)',
  actual:
    'renders the payload with the member\'s keys capitalised (`"Label"`), the convention a map baked for an untyped nested field uses',
  fixtures: ['intersection-member-index-signature-named-owner'],
})
