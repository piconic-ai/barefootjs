---
"@barefootjs/xyflow": patch
---

`fitView()` called before the pane or the nodes are measured no longer sets a NaN viewport (or fits an empty box at max zoom). Unmeasured nodes use their declared `width`/`height` (or `initialWidth`/`initialHeight`); when the pane, or a node with no declared size, is not measured yet, the fit waits and runs once they are.
