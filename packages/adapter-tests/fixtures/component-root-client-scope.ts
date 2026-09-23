import { createFixture } from '../src/types'

/**
 * A client component whose entire JSX return is a single child-component
 * call (no wrapping element). The parent owns the signal and the
 * forwarded buttons, so its SSR must carry its own scope: Hono wraps the
 * child's output in the parent's `<!--bf-scope:...-->` comment pair
 * (with the parent's props), which is what lets the parent hydrate and
 * its handlers reach the child's prop.
 *
 * `normalizeHTML` strips scope comments before comparing adapters, so the
 * byte comparison cannot see a missing pair; the `interactions` below
 * describe the contract the hydrated page must meet.
 */
export const fixture = createFixture({
  id: 'component-root-client-scope',
  description: "a client component whose root is a child-component call renders its own scope comment so it hydrates",
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

function Kid({ label, children }: { label: string; children?: unknown }) {
  return (
    <div>
      <p class="label">{label}</p>
      {children}
    </div>
  )
}

export function ComponentRootClientScope({ label }: { label: string }) {
  const [text, setText] = createSignal(label)
  return (
    <Kid label={text()}>
      <button class="load" onClick={() => setText('loaded')}>load</button>
    </Kid>
  )
}
`,
  props: { label: 'idle' },
  expectedHtml: `
    <div bf-s="test_s1">
      <p bf="s1" class="label"><!--bf:s0-->idle<!--/--></p>
      <button bf="^s0" class="load">load</button>
    </div>
  `,
})
