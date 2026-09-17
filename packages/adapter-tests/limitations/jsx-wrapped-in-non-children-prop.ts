import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'by-design',
  title: 'JSX wrapped in a ternary or array at a non-children prop',
  given: 'a component prop other than `children` whose value is a ternary or array literal wrapping JSX elements (`header={cond ? <a/> : <b/>}`)',
  expected: 'the chosen elements render inside the child in the server HTML',
  diagnostic: 'BF021',
  reason:
    'The shape is refused in the shared JSX-to-IR phase, identically on every adapter including the reference: the classifier has no structured node for it, and the only alternative was splicing raw JSX source text into the emitted client JS untyped. Passing the elements as `children`, or lifting the ternary into a single JSX element, is the supported form.',
  fixtures: ['jsx-element-prop-ternary', 'jsx-element-prop-array'],
})
