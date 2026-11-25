import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A closed rest key spelling a boolean attribute in another letter case',
  given: 'a closed rest spread whose props type declares a key that spells a boolean attribute in another letter case (`HIDDEN?: string`), passed a string (`"yes"`)',
  expected: 'the key renders with its value (`HIDDEN="yes"`)',
  actual: 'Renders the key as a bare boolean attribute (`HIDDEN`), dropping its value',
  fixtures: ['spread-closed-rest-boolean-case-keys'],
})
