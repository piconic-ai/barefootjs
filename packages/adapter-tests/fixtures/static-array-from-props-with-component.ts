import { createFixture } from '../src/types'

/**
 * Static-array loop whose body is a single child component, where the
 * array is built from props at component-init time (#1268). The
 * expression `Object.entries(props.tags).filter(...)` cannot be inlined
 * into the CSR template (function call + component-scope dependency),
 * so the loop array becomes `[]` in the template substitution.
 *
 * Before #1268 the materialize gate excluded childComponent bodies, so
 * `createComponent` mounts of `TagList` rendered an empty `<ul>`. The
 * fix builds a `staticItemTemplate` for childComponent loops (a single
 * `${renderChild('Tag', ..., key)}` expression) and removes the
 * exclusion, letting the existing clone-and-insert branch handle the
 * rendered child HTML.
 *
 * This fixture pins the SSR-then-hydrate path: the Hono adapter
 * evaluates the JSX at request time with real prop values and emits the
 * fully rendered HTML directly. CSR conformance for this fixture is
 * covered by the runtime regression test in
 * `packages/client/__tests__/runtime/static-loop-csr-materialize.test.ts`
 * since the harness here only evaluates the `template:` lambda.
 *
 * This fixture combines two SSR refusal shapes: a sibling-imported
 * child component (Tag from `./tag`) AND an array-destructure loop
 * param (`([id, t]) => ...`). Adapters that can't lower either
 * declare the matching diagnostics via `expectedDiagnostics` on
 * their own test file (#1266).
 * The remaining template-adapter refusal (computed component-scope const as
 * the loop source) is tracked in #2321.
 */
export const fixture = createFixture({
  id: 'static-array-from-props-with-component',
  description: 'Static-array loop with childComponent body materialises rendered children on CSR (#1268)',
  source: `
'use client'
import { Tag } from './tag'

type Props = {
  tags: Record<string, { variant: 'on' | 'off' }>
}

export function TagList(props: Props) {
  const entries = Object.entries(props.tags).filter(([, t]) => t.variant === 'on')
  return (
    <ul>
      {entries.map(([id, t]) => (
        <Tag key={id} id={id} variant={t.variant} />
      ))}
    </ul>
  )
}
`,
  components: {
    './tag.tsx': `
'use client'
export function Tag(props: { id: string; variant: 'on' | 'off' }) {
  return <span class={'tag-' + props.variant}>{props.id}</span>
}
`,
  },
  props: {
    tags: { a: { variant: 'on' }, b: { variant: 'off' }, c: { variant: 'on' } },
  },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <span bf-s="Tag_*" bf="s1" class="tag-on" data-key="a"><!--bf:s0-->a<!--/--></span>
      <span bf-s="Tag_*" bf="s1" class="tag-on" data-key="c"><!--bf:s0-->c<!--/--></span>
    </ul>
  `,
})
