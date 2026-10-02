import { createFixture } from '../src/types'

/**
 * #3250: a child component whose signal or prop name is a Pebble/Java
 * reserved word (`filter`). The compiled `.peb` reads it as `filter_`, but
 * the Pebble runtime's `render_child` derived the child's context from its
 * `ssrDefaults` under the SOURCE name, so the child's SSR rendered the
 * `class` empty. Two shapes:
 * - `FilterLink`: a `filter` signal with a static default.
 * - `SeededLink`: a signal seeded from a reserved-word prop (`filter`),
 *   whose `ssrDefaults` entry looks the prop up by name.
 */
export const fixture = createFixture({
  id: 'reserved-word-child-signal',
  description:
    'A child component whose signal (`filter`) or prop (`filter`) is a template-language reserved word must ' +
    'SSR its value: the child context is keyed by the name the compiled template reads (#3250).',
  source: `
import { FilterLink } from './filter-link'
import { SeededLink } from './seeded-link'
export function Filters() {
  return (
    <nav>
      <FilterLink />
      <SeededLink filter="all" />
    </nav>
  )
}
`,
  components: {
    './filter-link.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function FilterLink() {
  const [filter, setFilter] = createSignal('all')
  return <a className={filter() === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All</a>
}
`,
    './seeded-link.tsx': `
'use client'
import { createSignal } from '@barefootjs/client'
export function SeededLink(props: { filter: string }) {
  const [current, setCurrent] = createSignal(props.filter)
  return <a className={current() === 'all' ? 'selected' : ''} onClick={() => setCurrent('all')}>Seeded</a>
}
`,
  },
  expectedHtml: `
    <nav bf-s="test">
      <a bf-s="test_s0" bf="s0" class="selected">All</a>
      <a bf-s="test_s1" bf="s0" class="selected">Seeded</a>
    </nav>
  `,
})
