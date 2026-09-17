import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'by-design',
  title: 'Rich-typed prop read by client code',
  given: 'a prop typed as a JSON-unsafe host type (`Map`, `Set`, `WeakMap`, `WeakSet`, `URLSearchParams`, `RegExp`, `Promise`, `Error`, `Symbol`, `BigInt`, `Function`) that the component own client code reads',
  expected: 'the client handler sees the same value the server rendered with',
  diagnostic: 'BF049',
  reason:
    'Props cross the `bf-p` hydration boundary as `JSON.stringify` data with no type-aware revival, so these types lose their contents (`Map` / `Set` serialize to `{}`, `BigInt` throws, `Promise` / `Function` cannot cross a serialization boundary at all). A typed revival envelope was considered and rejected as a nine-adapter protocol change that still could not carry every listed type. The sound path is to pass a JSON-safe value and rebuild the rich value client-side.',
  fixtures: ['rich-prop-client-read'],
})
