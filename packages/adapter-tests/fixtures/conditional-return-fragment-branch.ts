import { createFixture } from '../src/types'

/**
 * A conditional-return client component whose default branch is wrapped in
 * a bare JSX fragment (`return <>…</>`) while the other branch is a bare
 * element — the shape the mutation sweep's `fragment-wrap` mutant produces
 * from `conditional-return-button` / `button` / `kbd` (see
 * `mutation-quarantine.ts`'s now-removed `FRAGMENT_WRAP_CONDITIONAL_RETURN_BRANCH_SCOPE_ID`
 * group), written out as real source.
 *
 * Used to be a browser-tested `defineSharedFixture` (this fixture's SSR was
 * correct and so was a fresh client mount; only claiming existing SSR
 * markup during HYDRATION missed the fragment-wrapped branch's root — no
 * `bf-s`, so its own events never bound). #3063 made the shape a loud BF029
 * compile-time refusal instead of a silent hydration gap, since
 * `ComponentDef`'s `comment`/`fragmentRoot` flags (`emit-registration.ts`)
 * are decided once per component from `ir.root.type`, which can't say
 * "branch A is fragment-rooted, branch B isn't". This fixture now asserts
 * the refusal (`conformancePins`, all nine adapters — a compiler-level
 * refusal fires ahead of any adapter's `adapter.generate()` and so applies
 * identically everywhere) rather than comparing rendered HTML; the escape
 * (`/* @client *\/` immediately before the fragment) is pinned separately by
 * `packages/jsx/src/__tests__/fragment-wrapped-conditional-return-branch.test.ts`.
 *
 * Registry limitation `fragment-wrapped-conditional-return-branch-scope`
 * (now `kind: 'refusal'`).
 */
export const fixture = createFixture({
  id: 'conditional-return-fragment-branch',
  description:
    'Conditional return whose default branch is fragment-wrapped now refuses to compile (BF029) instead of silently shipping an unhydratable branch',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

export function ConditionalReturnFragmentBranch(props: { asLink?: boolean }) {
  const [count, setCount] = createSignal(0)
  if (props.asLink) {
    return (
      <a class="cr-link" href="#" onClick={() => setCount(count() + 1)}>
        link: {count()}
      </a>
    )
  }
  return (
    <>
      <button class="cr-button" onClick={() => setCount(count() + 1)}>
        button: {count()}
      </button>
    </>
  )
}
`,
  props: {},
})
