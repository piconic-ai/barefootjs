import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A destructure default that reads an earlier param',
  given: 'a props destructure whose default reads an earlier param of the same pattern (`{ off = false, on = off }`), with the later prop omitted',
  expected: "the omitted prop takes the earlier param's value",
  actual:
    'emits the default verbatim into the client JS (`_p.on ?? off`), where the earlier param is undeclared, and renders the omitted prop empty on the server',
  fixtures: ['boolean-logical-stringify-dependent-default'],
})
