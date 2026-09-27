---
"@barefootjs/jsx": minor
---

`bf debug graph` shows `createQuery` and `createMutation`. A factory's value signal is annotated with the factory and its action. For a query, it also lists the signals and memos its request function reads: each of those has a `query:<value>` edge, since a change re-sends the request. A mutation has no such edges, because its request function is read untracked.

Each action's `isPending()` and `error()` accessors are nodes (`ComponentGraph.accessors`), with edges to the template positions, memos and effects that read them. A binding's `deps` names such a read `<action>.<accessor>`, and `bf debug trace` accepts an accessor as its target. `--json` output carries the same data (`signals[].factory`, `accessors`).
