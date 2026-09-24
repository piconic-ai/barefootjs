import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'Attribute written only by a ref callback never reaches SSR',
  given:
    'an element whose `ref` callback unconditionally writes an attribute on mount — `el.setAttribute(\'<name>\', …)` or `el.dataset.<key> = …`, at the top level of the ref body or of a `createEffect` / `onMount` directly inside it — that the element\'s own JSX never renders',
  expected: 'the server HTML and the hydrated DOM carry the same attribute value',
  diagnostic: 'BF063',
  fixtures: ['ref-mount-attr'],
})
