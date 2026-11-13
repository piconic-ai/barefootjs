import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'CSR template reading an object const that holds a function',
  given:
    "a const object literal with an arrow-valued property (`const H = { safe: 'ok', get: () => … }`) read for another key in markup (`{H.safe}`), rendered client-side",
  expected: "the listed value (`'ok'`)",
  actual: 'renders empty: the client template does not carry the const, so the read has nothing to resolve',
  fixtures: ['module-const-inherited-key-object-safe'],
})
