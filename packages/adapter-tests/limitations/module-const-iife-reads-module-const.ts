import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Module const initialized by an immediately invoked arrow that reads another module const',
  given:
    "a module const whose initializer is an immediately invoked arrow reading another module value const (`const V = 'v'; const B = (() => ({ k: V }))()`), read in markup (`{B.k}`)",
  expected: "the value the arrow returns (`'v'`)",
  actual: 'renders empty, in the server HTML of a template adapter and on a client mount',
  fixtures: ['module-const-iife-reads-module-const'],
})
