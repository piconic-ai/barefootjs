import { createFixture } from '../src/types'

/**
 * #2757 — a component whose ROOT is a child-component call (`return <Row/>`,
 * compiled as `comment: true` / `fragmentRoot: false`, the #1211/#2649 shape).
 * The wrapper owns no element of its own, so the child's root carries the
 * scope: `bf-s="<wrapperScope>_sN"` — derived from the WRAPPER, not from the
 * child's own name. (The reference also stamps a `bf-h`/`bf-m` slot pair
 * naming the wrapper as host; `normalizeHTML` strips both, so only the `bf-s`
 * prefix is visible at this layer.) This fixture is the durable statement of
 * that convention.
 *
 * Honesty note about what this fixture can and cannot catch: it does NOT go red
 * on the pre-#2757 runtime. The defect was pure-CSR-mount-only — the child's
 * prefix came out as its OWN display name (`Row_xyz_sN`, no `bf-h`/`bf-m`)
 * because `materializeComponent` never derived a scope id to thread into
 * `renderChild` for a top-level wrapper of this shape. Neither conformance leg
 * in this package reaches that code: the SSR leg renders through the adapter,
 * and the CSR leg (`csr-render.ts`) evaluates the compiled `template:` lambda
 * against a mock runtime rather than the real `createComponent`. The executable
 * pin for the regression is:
 *
 *   - packages/client/__tests__/runtime/issue-2757-top-level-comment-wrapper-scope.test.ts
 *
 * which mounts this exact shape through the real runtime and asserts the
 * wrapper-derived prefix and the `bf-h`/`bf-m` pair.
 */
export const fixture = createFixture({
  id: 'child-component-root-scope-prefix',
  description: 'Root-is-a-child-call component: the child root carries the wrapper-derived scope id and slot pair',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
import { Row } from './row'
export function RootIsChildCall() {
  const [val, setVal] = createSignal(0)
  return (
    <Row>
      <span>{val()}</span>
      <button onClick={() => setVal(val() + 1)}>inc</button>
    </Row>
  )
}
`,
  components: {
    './row.tsx': `
export function Row({ children, ...rest }: { children?: unknown; [key: string]: unknown }) {
  return <div {...rest}>{children}</div>
}
`,
  },
  expectedHtml: `
    <div bf-s="test_s3" bf="s0">
      <span bf="^s1"><!--bf:^s0-->0<!--/--></span>
      <button bf="^s2">inc</button>
    </div>
  `,
})
