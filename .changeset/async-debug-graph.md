---
"@barefootjs/jsx": minor
"@barefootjs/cli": patch
---

`bf debug graph` shows `createQuery` and `createMutation`. Each factory is listed in `ComponentGraph.factories`, and its value signal is annotated with the factory and its action. When the value isn't destructured (`const [, save] = createMutation(…)`), the factory is keyed by its action.

A query lists the signals, memos and props its request function reads, and each of them gets a `query:<key>` edge (the factory's key: its value's name, or its action's), since a change re-sends the request. Only the request function counts, because `options` is read once, at creation. A mutation has no such edges, because its request function is read untracked.

Each action's `isPending()` and `error()` accessors are nodes (`ComponentGraph.accessors`), with edges to the template positions, memos and effects that read them. A binding's `deps` names such a read `<action>.<accessor>`, and a binding that reads one counts as reactive, not as a fallback. A loop parameter or arrow parameter that shadows the action name is not a read.

`bf debug trace` accepts an accessor as its target, and the new `traceableNames` lists every name it accepts. `bf debug why-update` explains an accessor read, and a factory's value, by the handlers that call the action and by the query's request inputs. `--json` output carries the same data (`factories`, `signals[].factory`, `accessors`).

The new `createAnchoredProgram` builds the Program a test harness passes to `compileJSX` when it compiles sources under relative names, so type resolution no longer depends on the current directory.
