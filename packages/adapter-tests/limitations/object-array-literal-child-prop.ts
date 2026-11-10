import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'refusal',
  title: 'An array of object literals passed as a child component prop',
  given:
    'a child component prop whose value is an array of object literals, written in place (`items={[{ id: \'x\' }]}`) or a const holding one (`items={ITEMS}`)',
  expected: 'the child receives the array and renders each object\'s members',
  diagnostic: 'BF101',
  fixtures: ['module-const-object-array-child-prop'],
})
