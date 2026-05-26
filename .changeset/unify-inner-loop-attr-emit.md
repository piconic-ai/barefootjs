---
"@barefootjs/jsx": patch
---

Unify inner-loop reactive-attribute emit through the centralised emitAttrUpdate helper (#1368). Fixes boolean-attr handling in nested loops (now uses DOM property assignment) and adds missing className/value special-case handling.
