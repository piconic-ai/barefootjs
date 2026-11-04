import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A nil value in a `style` object property',
  given: 'a `style={{ color: x }}` object whose property value is `null` or `undefined` (an explicit `null` prop, an omitted prop, a literal)',
  expected: 'the property is dropped, leaving `style=""`',
  actual: 'renders the property with an empty value (`style="color:"`), or omits the `style` attribute itself',
  fixtures: ['style-object-nil-property'],
})
