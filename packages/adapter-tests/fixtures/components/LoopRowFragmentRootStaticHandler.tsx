'use client'

// Test fixture (#3821): rows of a static (module-const) array whose row
// component renders a fragment root, so SSR scopes each row with a
// `<!--bf-scope:-->` comment and no element carries the row's scope. Each
// row must still be initialised: a handler forwarded through the row's
// `children` (`.forwarded`), the row component's own handler calling a
// callback prop, in both props forms (`.own` destructured, `.own-props`
// `function C(props)`). Fragment-rooted rows nested in a fragment-rooted
// group, and a fragment-rooted component inside a plain-element row, are
// covered by
// `packages/client/__tests__/runtime/issue-3821-static-array-fragment-root-row.test.ts`
// instead: go-template does not render either shape over a module-const
// array, whatever the child's root (BF101 for the element row; no rows for
// the group).

import { createSignal } from '@barefootjs/client'

type Item = { id: string }

function Pill({ children }: { children?: any }) {
  return (
    <>
      <span className="pill">{children}</span>
    </>
  )
}

function PickPill({ id, onPick }: { id: string; onPick: (id: string) => void }) {
  return (
    <>
      <button type="button" className="own" onClick={() => onPick(id)}>{id}</button>
    </>
  )
}

function PickPillProps(props: { id: string; onPick: (id: string) => void }) {
  return (
    <>
      <button type="button" className="own" onClick={() => props.onPick(props.id)}>{props.id}</button>
    </>
  )
}

const ITEMS: Item[] = [{ id: 'a' }, { id: 'b' }]

export function LoopRowFragmentRootStaticHandler() {
  const [picked, setPicked] = createSignal('none')
  return (
    <div>
      <p className="picked">{picked()}</p>
      <div className="forwarded">
        {ITEMS.map((o) => (
          <Pill key={o.id}>
            <button type="button" className="pick" onClick={() => setPicked(`f-${o.id}`)}>{o.id}</button>
          </Pill>
        ))}
      </div>
      <div className="own">
        {ITEMS.map((o) => (
          <PickPill key={o.id} id={o.id} onPick={(id) => setPicked(`o-${id}`)} />
        ))}
      </div>
      <div className="own-props">
        {ITEMS.map((o) => (
          <PickPillProps key={o.id} id={o.id} onPick={(id) => setPicked(`p-${id}`)} />
        ))}
      </div>
    </div>
  )
}
