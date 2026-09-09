---
"@barefootjs/jsx": patch
"@barefootjs/cli": patch
---

Fix #2903: `bf debug graph` reported `(no tracked deps)` for a `props.value` read the IR itself marks reactive. Prop reads (`props.x`, destructured props, and props captured by a prop-derived local const) now appear in each DOM binding's `deps` alongside signals and memos, the graph gains a `props` node list (also in `--json`) with `dependency graph` edges, and `bf debug why-update` / `bf debug trace` accept a prop name.
