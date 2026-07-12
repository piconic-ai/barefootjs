import { createFixture } from '../src/types'

/**
 * A NESTED (inner) `.map()` callback keyed by — and rendering — its own
 * positional index param (`key={i}` / `{i}: {item}`, #2218). Sibling of
 * `map-key-index` (index-as-key at the top level) and `map-index-handler`
 * (#2189, index closed over by a delegated handler) — this pins the shape
 * that threw `ReferenceError: i is not defined` in generated client JS
 * before the fix: `NestedLoop` never carried an `index` field, so the inner
 * `mapArray`'s keyFn and renderItem body never bound the user's index name.
 *
 * This fixture pins cross-adapter SSR/CSR-template output only. SSR
 * rendering was never broken by #2218 (plain `.map()` in real JS/Go/Ruby
 * has no such gap) and the CSR-conformance harness only evaluates the
 * `template()` lambda, not the runtime `mapArray` renderItem body where the
 * bug actually threw — so it can't regression-pin the `ReferenceError`
 * itself. That's covered by the real-DOM runtime test,
 * `packages/client/__tests__/runtime/nested-loop-index-param-e2e.test.ts`.
 *
 * The signal is explicitly typed (`createSignal<Group[]>`) — required for
 * the Go adapter, whose SSR data context bakes an object-array signal
 * initial value only against a concrete local struct (`parsedLiteralToGo`
 * defers object literals inside an untyped `[]interface{}` to `nil`,
 * which renders an empty list).
 */
export const fixture = createFixture({
  id: 'nested-map-index-key',
  description: 'Inner loop keyed by, and rendering, its own map index param',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type Group = { id: number; items: string[] }
export function NestedMapIndexKey() {
  const [groups] = createSignal<Group[]>([
    { id: 1, items: ['apple', 'plum'] },
    { id: 2, items: ['pecan'] },
  ])
  return (
    <ul>
      {groups().map((group) => (
        <li key={group.id}>
          {group.items.map((item, i) => (
            <span key={i}>{i}: {item}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`,
  expectedHtml: `
    <ul bf-s="test" bf="s3">
      <li bf="s2" data-key="1">
        <span data-key-1="0"><!--bf:s0-->0<!--/-->: <!--bf:s1-->apple<!--/--></span>
        <span data-key-1="1"><!--bf:s0-->1<!--/-->: <!--bf:s1-->plum<!--/--></span>
      </li>
      <li bf="s2" data-key="2"><span data-key-1="0"><!--bf:s0-->0<!--/-->: <!--bf:s1-->pecan<!--/--></span></li>
    </ul>
  `,
})
