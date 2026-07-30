---
"@barefootjs/xyflow": patch
---

Drop the `__bfFlowStore` host-element escape hatch — nothing read it, and its premise was false

`attachFlowSubsystems` stamped the flow store onto the host
`<div class="bf-flow">` so that, per its comment, "descendants that miss
`FlowContext`" could reach it via `el.closest('.bf-flow').__bfFlowStore`. The
stated cause was that `<Flow renderNode={Fn}>` hydrates its children as a
top-level scope outside the `FlowContext.Provider`, leaving `useFlow()` —
and therefore `useViewport()` / `useNodes()` / `useEdges()` /
`useNodesInitialized()`, which all call it — returning `undefined`.

Two things were wrong with that.

**Nothing read the property.** The only references in the repository were the
write itself and a unit test asserting the write. The would-be consumer,
`FlowNodeTypeBridge`, does not walk the DOM for the store — it tolerates
`store === undefined` and falls back to `props.forNode`. So this was a
write-only global on a public DOM element.

**The premise does not hold in the rendered DOM.** Walking up from a
`.bf-flow__node` in a browser, the provider's context map (`__bfCtx`) sits on
the `<div class="bf-flow">` host itself — an ancestor of every node — and
`useContext` resolves by walking `parentElement`. A connected descendant
therefore finds the store no matter which scope it was hydrated as. Which
scope the hydration walker chose never mattered; only ancestry does.

The one shape that genuinely returned `undefined` was a child running its
`init` while its row was still **detached**, so the `parentElement` walk had no
ancestors to find and fell through to the global last-writer-wins context
store. That is fixed at the root in the client runtime — loop rows are
connected before `init` runs — rather than by giving the store a second lookup
path. A second path would also have been the wrong shape: it hides the
ordering bug instead of surfacing it, and only for consumers who know to look.

`__bfFlowStore` was an undocumented internal expando, never part of
`@barefootjs/xyflow`'s exported surface and not mentioned in the docs, so
nothing in this repository changes behaviour. It was on a public DOM element
though, so code outside this repository could have reached it — if you read
`el.closest('.bf-flow').__bfFlowStore`, switch to `useFlow()` (or the derived
`useViewport()` / `useNodes()` / `useEdges()`), which resolves through context
from any connected descendant of the flow.

The unit test is repurposed to pin the removal, asserting the property is not
even *present* — a value check would also pass against an attach that stamped
the key and assigned `undefined`, which is still an expando. Beyond the dead
code, the comment claimed a live product defect that did not exist, and that
misreading fed a wrong priority call — which is the more expensive half of what
is being removed here.
