'use client'

import { createSignal } from '@barefootjs/client'

/**
 * The content of the **sidebar region** (`<aside bf-region="nav:0">`), a sibling
 * of the main content region — a master–detail layout (spec/router.md **v2**).
 *
 * Because both pages render this region with the same id and the same content,
 * its *owned content* never differs — the router's diff normalizes away the
 * per-render `bf-s` scope ids, so it is not fooled by the non-byte-identical raw
 * HTML — so it leaves the region mounted while it swaps only the differing
 * content region. This local pin counter is the proof: bump it, navigate to a
 * post, and it keeps its value — the sidebar island was never disposed.
 *
 * This is exactly the case a single-region (v0) router cannot express: with two
 * `[bf-region]` boundaries it would swap the first one (here the sidebar) and
 * never update the article. v2's id-keyed matching is what makes it work.
 */
export function Sidebar() {
  const [pins, setPins] = createSignal(0)
  return (
    <div className="sidebar">
      <div className="sidebar-title">Workspace</div>
      <button className="sidebar-pin" type="button" onClick={() => setPins((n) => n + 1)}>
        📌 pinned <span className="v">{pins()}</span>
      </button>
      <p className="sidebar-note">
        This panel is its own region. It keeps its state while the article on the right swaps.
      </p>
    </div>
  )
}
