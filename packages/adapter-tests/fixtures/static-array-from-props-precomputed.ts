import { createFixture } from '../src/types'

/**
 * `prop-precompute` twin of `static-array-from-props` (#2321) — the
 * SECOND escape kind, and the one the diagnostic offers FIRST.
 *
 * The base refuses on every DSL adapter because the loop array is a
 * component-scope `const` with a computed initializer
 * (`Object.entries(props.reactions ?? {}).filter(...)`). Its sibling
 * `static-array-from-props-client` escapes by deferring the whole loop to
 * the browser; this one escapes by moving the COMPUTATION out of the
 * component entirely — the caller passes the already-reduced array in as
 * a prop, so no adapter is ever asked to lower the expression.
 *
 * The contrast between the two twins is the point, and it is visible in
 * their committed `expectedHtml` rather than asserted in prose:
 *
 *   - `-client`      → `<div data-reaction-bar="true"></div>`  (empty until hydration)
 *   - `-precomputed` → the button, its emoji and its count, fully rendered
 *
 * That is exactly the `ssrCost` distinction `ESCAPE_SSR_COST` types
 * (`'client-render'` vs `'none'`, `packages/jsx/src/types.ts`), pinned in
 * a real backend render instead of a docstring. It is also why the
 * BF101 diagnostic lists pass-as-prop before `/* @client *​/`, and why the
 * compat matrix legend renders the cost next to each kind: a reader
 * choosing between the two escapes is choosing whether their content
 * exists in server HTML.
 *
 * Shape note: the precomputed array is an array of OBJECTS, not the
 * base's `[emoji, users]` pairs. An array-destructured loop param is
 * itself a shape several DSL adapters refuse (see the base fixture's
 * docstring, #1266) — a twin that traded one refusal for another would
 * fail tier 1 and prove nothing about `prop-precompute`. Reducing to
 * `{ emoji, count }` at the call site is what a user pre-computing
 * server-side would write anyway.
 *
 * This does NOT fix #2321: the compiler still cannot lower a
 * props-derived computed const at SSR time. What it proves is that the
 * refusal's first-listed escape genuinely works — full SSR included — on
 * every adapter.
 */
export const fixture = createFixture({
  id: 'static-array-from-props-precomputed',
  description: 'prop-precompute twin of static-array-from-props — computation moved to the caller, full SSR (#2321)',
  source: `
'use client'

type Reaction = {
  emoji: string
  count: number
}

type Props = {
  reactions: Reaction[]
}

export function ReactionBar(props: Props) {
  return (
    <div data-reaction-bar="true">
      {props.reactions.map(reaction => (
        <button key={reaction.emoji} type="button">
          <span>{reaction.emoji}</span>
          <span>{String(reaction.count)}</span>
        </button>
      ))}
    </div>
  )
}
`,
  props: {
    reactions: [{ emoji: '👍', count: 2 }],
  },
  expectedHtml: `
    <div bf-s="test" bf="s2" data-reaction-bar="true"><button data-key="👍" type="button"><span><!--bf:s0-->👍<!--/--></span><span><!--bf:s1-->2<!--/--></span></button></div>
  `,
})
