import type { Scenario } from '../scenario'

interface State {
  data: {
    label: string
  }
}

type Action = 'load' | 'clear'

/**
 * The remaining, unfixed-until-now half of #3113 (#3122): the PARENT's
 * entire JSX return is a single child-component call (`return <Kid ...>
 * ...</Kid>`, no wrapping element — `isCommentScopedRoot`'s
 * `root.type === 'component'` case, `packages/jsx/src/ir-to-client-js/
 * utils.ts`) AND the child's own root is itself a wrapping element (not
 * the bare element the reactive text marker lives directly under, unlike
 * `child-prop-slots.ts`). That element is BOTH the ancestor's registered
 * comment-scope proxy AND the child's own genuine `bf-s` scope root —
 * `claim-slots.ts`'s `findOwnedMarker` used the wrong ownership boundary
 * for that dual-purpose shape (walked past the child's own `bf-s` to the
 * ancestor's comment parent), rejecting the child's own reactive text
 * slot as "belongs to a nested scope" and silently dropping every update.
 *
 * The action buttons live inside `Kid` as forwarded `children` (`^`-
 * prefixed parent-owned markers) rather than in `CommentRootChildSlot`'s
 * own top-level JSX: the scenario contract (`scenario.ts`'s docstring)
 * requires each action's button to be reachable from the SCENARIO
 * component's own IR (`renderToTest`'s `findAll`, which does walk into a
 * child call's forwarded `children`), but the bug reproduction requires
 * `CommentRootChildSlot`'s entire return to be the bare `<Kid>` call with
 * no sibling content — a `<div>` wrapper around `<Kid/>` plus sibling
 * buttons (like `child-prop-slots.ts`) would drop `root.type === 'component'`
 * and stop reproducing #3122 entirely. Forwarding the buttons as `Kid`'s
 * children keeps `root.type === 'component'` while still giving the IR
 * smoke test buttons it can find and wire.
 */
export const commentRootChildSlot: Scenario<State, Action> = {
  id: 'comment-root-child-slot',
  description: 'a comment-scoped root child owns a prop-derived text slot nested under its own wrapping element',
  componentName: 'CommentRootChildSlot',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'

type Data = { label: string }
type State = { data: Data }

function Kid({ data, children }: { data: Data; children?: unknown }) {
  return (
    <div>
      <p aria-label="label">{data.label}</p>
      {children}
    </div>
  )
}

export function CommentRootChildSlot({ initial }: { initial: State }) {
  const [data, setData] = createSignal<Data>(initial.data)
  return (
    <Kid data={data()}>
      <button data-action="load" onClick={() => setData({ label: 'loaded' })}>load</button>
      <button data-action="clear" onClick={() => setData({ label: '' })}>clear</button>
    </Kid>
  )
}
`,
  initialState: { data: { label: '' } },
  actions: ['load', 'clear'],
  stateSignals: ['data'],
  reduce(_state, action) {
    return action === 'load'
      ? { data: { label: 'loaded' } }
      : { data: { label: '' } }
  },
  bounds: { maxDepth: 2 },
}
