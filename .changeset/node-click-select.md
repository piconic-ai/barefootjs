---
"@barefootjs/xyflow": patch
---

`setupNodeSelection` now removes its `mousedown` listener when its owner is cleaned up. The registry `<NodeWrapper>` calls it again, so clicking a node selects it (shift-click adds to the selection).
