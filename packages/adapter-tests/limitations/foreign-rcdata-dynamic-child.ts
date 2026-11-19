import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'A reactive or non-text child of a `<title>` or `<textarea>` in SVG or MathML content, on the Go template adapter',
  given: 'a `<title>` / `<textarea>` inside foreign content whose child is a reactive expression (`<svg><title>{props.tip}</title></svg>`) or an element, conditional, loop or component',
  expected: 'the child renders as in the reference: a reactive expression keeps its comment-node slot markers around the value',
  diagnostic: ['BF101'],
  fixtures: ['foreign-title-slot', 'foreign-title-markup-child', 'raw-text-host-annotation-xml-encodings'],
})
