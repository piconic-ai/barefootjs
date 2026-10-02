---
"@barefootjs/xyflow": patch
---

Measure handle bounds so edges with a `sourceHandle` / `targetHandle` attach at those handles instead of falling back to a bottom-to-top path. New `measureNode(el, nodeId, store)` records a node's size and its handles' bounds; the registry `<NodeWrapper>` calls it once nodes are laid out and on every resize.
