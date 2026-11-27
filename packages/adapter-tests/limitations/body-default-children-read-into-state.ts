import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A defaulted body destructure of children read into state',
  given:
    "a component that destructures its children from the props object in the body with a default and seeds a signal from the binding (`const { children = 'dflt' } = props`, `createSignal(children ?? 'missing')`), rendering the signal",
  expected: 'the signal holds the default when the call passes no children and the children otherwise (`dflt`, `t` for `<Note>t</Note>`)',
  actual: 'renders nothing in either case',
  fixtures: ['children-body-default-nullish-seed'],
})
