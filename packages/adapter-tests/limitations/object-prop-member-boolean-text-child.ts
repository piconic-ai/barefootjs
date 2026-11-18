import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'Boolean member of an object-typed prop as a text child',
  given: 'a boolean member of an object-typed prop as a text child, read directly (`{props.cfg.on}`), behind `??` (`{props.cfg.off ?? \'none\'}`), or through a memo over either',
  expected: 'the child renders nothing, as a boolean child does',
  actual: 'renders the boolean as text: `true` / `false`, or `1` / `0`',
  fixtures: ['object-prop-member-boolean-text-child'],
})
