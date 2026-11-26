'use client'

// Test fixture: a child component whose prop reads an init-only local (`label`,
// the result of calling an arrow over a signal) is deferred to the client's init, so the client
// template holds a placeholder in its place. The child sits where only
// phrasing content parses in place: directly in a `<p>`, and in a `<span>`
// inside a `<p>`. A `<div>` placeholder there makes the HTML parser close the
// `<p>`, so the mounted child landed after it instead of inside it.

import { createSignal } from '@barefootjs/client'

function PhrasingChild(props: { label: string }) {
  return <b className="child">{props.label}</b>
}

export function DeferredChildPhrasingParent() {
  const [name] = createSignal('a')
  // A block body keeps `label` init-only: the client template splices an
  // expression-bodied zero-param helper's call as its body, which would
  // render the child in place instead of deferring it.
  const read = () => {
    return name()
  }
  const label = read()
  return (
    <div>
      <p className="para">
        <PhrasingChild label={label} />
      </p>
      <p className="nested">
        <span>
          <PhrasingChild label={label} />
        </span>
      </p>
    </div>
  )
}
