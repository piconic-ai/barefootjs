import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest key in SVG camelCase on an SVG element',
  given: 'a closed rest spread whose props type declares an SVG presentation attribute in camelCase (`strokeWidth`), spread onto an SVG element (`<path {...rest} />`)',
  expected: 'the key renders kebab-cased (`stroke-width="2"`)',
  actual: 'Renders the key with its camelCase spelling (`strokeWidth="2"`), which an SVG element does not read as `stroke-width`',
  fixtures: ['spread-closed-rest-svg-case-keys'],
})
