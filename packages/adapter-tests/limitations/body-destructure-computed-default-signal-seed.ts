import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A signal seeded from a body-destructured prop with a computed default',
  given:
    'a `(props)`-arg component whose body destructure gives a prop a computed default (`const { b = \'z\'.toUpperCase() } = props`, or one reading a component const) and seeds a signal from that binding (`createSignal(b)`)',
  expected: 'the signal holds the default when the prop is omitted, and the passed value otherwise',
  actual: 'emits a props constructor that does not compile: the prop\'s untyped field is assigned to the signal\'s typed field as is',
  fixtures: ['destructure-default-local-const-signal-seed'],
})
