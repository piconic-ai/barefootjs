import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A key no property declares, read through an inline object type with an index signature',
  given:
    'a prop typed as an inline object type that declares an index signature beside its properties (`data: { label: string; [key: string]: string }`), read by a key no property declares (`props.data[\'extra\']`)',
  expected: 'the value of that key (`label:extra`)',
  actual:
    'emits a program that does not build, since the struct generated for the type has a field for each declared property only, and the caller\'s value for the other key has none',
  fixtures: ['inline-object-prop-index-signature'],
})
