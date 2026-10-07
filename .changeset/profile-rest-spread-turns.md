---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

`bf debug profile --scenario` now attributes the work of an event handler forwarded through a rest/props spread (`<button {...props}>`) to an interaction turn. In profile mode the compiler passes the spread site to `applyRestAttrs`, which brackets each handler it wires with `beginTurn("<Component>#handler:<slot>:<event>")` / `endTurn()` like an explicit `on*` handler; the profiler resolves that id to the spread's source location. Production builds pass no site and attach the handlers unchanged.
