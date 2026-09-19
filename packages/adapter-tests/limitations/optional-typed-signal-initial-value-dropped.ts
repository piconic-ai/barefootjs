import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A signal declared with an explicit `T | undefined` type argument loses its literal initial value at SSR',
  given:
    'a signal created as `createSignal<string | undefined>(\'one\')` whose getter is rendered as an attribute (`title={label()}`) or as a text expression',
  expected: 'the server HTML carries the literal initial value (`title="one"` and the text `one`), as the reference renders',
  actual:
    'seeds the field from the union type instead of the literal (`Label interface{}` initialised to `nil`), so the server HTML renders `title=""` and empty text until hydration writes the real value',
  fixtures: ['signal-optional-init'],
})
