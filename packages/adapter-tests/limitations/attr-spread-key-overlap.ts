import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A key written by an open spread and by another attribute or spread',
  given:
    'an open spread (`{...rest}`, `{...bag()}`) and an explicit attribute with an expression or template value before it, an explicit attribute after it, a second open spread that carries the same key, a rest bag spelled like the props object (`{ size, ...props }`), a spread of a local `const` or a conditional object, or a bag key holding an explicit `null` over an earlier literal',
  expected: 'the key renders once, with the last write; a `null` bag value overrides the earlier literal and renders nothing',
  actual: 'Renders the key twice, so a browser keeps the first, or renders the earlier literal where the bag holds `null`',
  fixtures: ['attr-spread-key-overlap'],
})
