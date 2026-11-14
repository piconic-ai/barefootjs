import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A declared key in a body rest over an open props type',
  given:
    'the rest of a component-body destructure of the props object, whose type is open (`const { title, ...rest } = props` with `props: { title?: string; tone?: string; [key: string]: unknown }`), spread onto an element or a child component',
  expected: 'the spread carries every key the caller passed except the ones the destructure takes, so a key the props type declares (`tone`) reaches the element or the child',
  actual: 'drops the keys the props type declares from the spread: only the undeclared keys are carried',
  fixtures: ['open-body-rest-spread-child-omits-keys', 'open-body-rest-spread-element'],
})
