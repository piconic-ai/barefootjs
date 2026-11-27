import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A children fallback read with a boolean fallback',
  given:
    'a `??` / `||` read of the children prop whose fallback is a boolean (`{props.children ?? false}`, `{children || false}`), read directly or through a body const (`const label = props.children ?? false`), rendered as text',
  expected: 'present children render as markup (`<p><i>a</i></p>`); absent children render nothing, as `{false}` does',
  actual: 'drops present children read through the const (`<p></p>`) and renders absent children as `false` (`<p>false</p>`)',
  fixtures: ['children-fallback-value-shapes'],
})
