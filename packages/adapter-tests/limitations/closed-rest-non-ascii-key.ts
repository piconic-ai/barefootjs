import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest key that is not an ASCII identifier',
  given: 'a closed rest spread (`{...rest}` whose props type declares `Ä?: number`) on an element, so the template reads the key as `rest.Ä`',
  expected: 'the key renders as its own attribute (`Ä="2"`)',
  actual: 'Emits a template that does not parse (`rest.Ä` is not an identifier there), so the component fails to render',
  fixtures: ['spread-closed-rest-non-ascii-key'],
})
