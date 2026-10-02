import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'An attribute bound to an undefined-valued signal renders empty instead of being omitted',
  given: 'a non-boolean element attribute (`title`, `data-*`) whose whole value is a signal read, where the signal starts as `undefined`',
  expected: 'the attribute is omitted from the SSR output, the way Hono omits any `undefined`-valued attribute',
  actual: 'renders the attribute with an empty value (`title=""`)',
  fixtures: ['nullish-signal-attr'],
})
