'use client'

// DOM-state carrier fixture (#2481): controlled <textarea value={...}>
// with a live preview, hydrating and reacting to typed input. Exercises
// the `value` IDL property the oracle harness's dom-state.ts vocabulary
// tracks. The corpus already has a `textarea` (site/ui) fixture covering
// `value` via `fill`, but that one wraps a component; this native,
// unwrapped element widens the property-table coverage the new oracles
// (`packages/adapter-tests/e2e/oracle.playwright.ts`) exercise.

import { createSignal } from '@barefootjs/client'

export function NoteBoxNative() {
  const [note, setNote] = createSignal('initial note')

  return (
    <div className="notebox">
      <textarea className="note-textarea" value={note()} onInput={(e) => setNote(e.target.value)} />
      <p className="note-preview">{note()}</p>
    </div>
  )
}
