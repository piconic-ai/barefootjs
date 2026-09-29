---
"@barefootjs/xyflow": patch
---

The node drag handler now calls the drag callbacks. `onNodeDragStart` and `onNodeDragStop` were accepted and kept on the store but never called; they now fire on the first move and on release. The new `onNodeDrag` fires on every move, with the node where it is by then. A press without a move is a click and fires none of them, even when the browser sends a `pointermove` that does not move the node (pen pressure or tilt, touch).
