'use client'

import { Region } from '@barefootjs/client'
import { ReaderToolbar } from './ReaderToolbar'

/**
 * The content area as **compiler-derived nested regions** (spec/router.md v2).
 *
 * Unlike the hand-authored sidebar (`renderer.tsx`), the region boundaries here
 * come from the `<Region>` component: `bf build` lowers each to a deterministic
 * `bf-region="<file-scope hash>:<index>"` id — `…:0` for the outer, `…:1` for
 * the inner — the same on every page that renders this shell.
 *
 *   - **outer** region: holds the persistent `ReaderToolbar`. Its owned content
 *     (the toolbar + the masked inner region) is the same across pages, so the
 *     router never swaps it — the toolbar keeps its font-size level.
 *   - **inner** region: wraps the page `children`, which differ per page, so it
 *     is the region the router actually swaps.
 *
 * (`"use client"` is required only because `bf build` compiles island files; the
 * component ships almost no client JS — it exists to lower the regions.)
 */
export function PageShell({ children }: { children?: unknown }) {
  return (
    <Region>
      <ReaderToolbar />
      <div className="content-area">
        <Region>{children}</Region>
      </div>
    </Region>
  )
}
