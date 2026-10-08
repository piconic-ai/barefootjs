import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A reserved name and its `_`-suffixed twin collide',
  given: 'a component with both a reserved name and its `_`-suffixed twin as props (`props.loop` and `props.loop_`)',
  expected: 'each prop renders its own value (`first:second`)',
  actual:
    'renders the twin\'s value for both (`second:second`): the reserved word is mangled by appending `_`, which yields the twin\'s own name',
  fixtures: ['reserved-name-and-suffixed-twin'],
})
