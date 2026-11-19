import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A dynamic child of a title that is not an HTML element, on the Go template adapter',
  given: 'a `<title>` with a dynamic child inside foreign content (an SVG, or a MathML `annotation-xml` without an HTML `encoding`), where the slot markers are comment nodes around the value',
  expected: 'the slot markers stay comment nodes around the value, as in the Hono reference',
  actual: 'emits the slot markers as HTML-escaped text inside the title, because html/template treats every `title` as RCDATA',
  fixtures: ['raw-text-host-annotation-xml-encodings'],
})
