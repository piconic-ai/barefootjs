import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A const reading a signal getter, read in a loop row that shadows the getter',
  given:
    'a component-scope const whose initializer reads a signal getter (`const b = count()`) read inside a `.map()` row whose parameter has the getter\'s name (`rows.map(count => …{b}…)`)',
  expected: 'the read renders the signal\'s value',
  actual: 'renders nothing, or fails to render: the template reads the const as a variable that is never set',
  fixtures: ['const-getter-read-loop-shadowed'],
})
