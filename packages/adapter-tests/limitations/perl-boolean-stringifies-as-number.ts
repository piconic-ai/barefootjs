import { defineLimitation } from '../src/limitations'

export default defineLimitation({
  kind: 'silent',
  title: 'A stringified boolean renders 1 / 0 on the Perl adapters',
  given: 'a boolean value stringified in a template (`String(flag)`, `${flag}`, or a boolean row key)',
  expected: 'it renders `true` / `false`',
  actual: 'renders `1` / `0`: Perl has no boolean type, and the decoded JSON boolean stringifies as a number',
  fixtures: ['falsy-row-clicks'],
})
