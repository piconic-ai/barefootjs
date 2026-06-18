'use client'

import { createSignal } from '@barefootjs/client'

/**
 * A stateful island that lives in the **outer** region (`PageShell`), above the
 * inner region the router swaps. Its font-size level is the proof of nested v2:
 * bump it, navigate between pages, and it keeps its value — the outer region
 * (and this island) is never swapped, only the inner content region is.
 */
export function ReaderToolbar() {
  const [level, setLevel] = createSignal(1)
  return (
    <div className="reader-toolbar">
      <span className="rt-label">font</span>
      <button className="rt-btn" type="button" aria-label="smaller" onClick={() => setLevel((n) => Math.max(0, n - 1))}>
        A-
      </button>
      <span className="rt-level v">{level()}</span>
      <button className="rt-btn" type="button" aria-label="larger" onClick={() => setLevel((n) => n + 1)}>
        A+
      </button>
    </div>
  )
}
