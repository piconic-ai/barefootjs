import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Quoted literal segments in an attribute template expression',
  given: 'an attribute template expression containing double quotes in outer and nested literal segments',
  expected: 'the attribute retains its complete string value with literal quotes escaped in HTML',
  actual: 'emits unescaped literal quotes that break the attribute and cause a template rendering error',
  fixtures: ['template-literal-attribute-quotes'],
})
