---
"@barefootjs/jsx": patch
---

Fix #2231: a FULLY-STATIC (module-const array, not a signal or a prop) nested loop's inner `.map((sub, i) => ...)` index param, referenced in a child-component prop, no longer throws `ReferenceError: i is not defined` at hydration.

Follow-up to #2218 (PR #2230), which fixed the reactive (`mapArray`) and branch-arm paths via `loopKeyFn` + the renderItem alias — this family never goes through either, so it needed its own fix. The `inner-loop-nested` shape (`build-static-array-child-init.ts`) hardcoded the synthetic `__innerIdx` as the inner `forEach`'s second param, so a declared-and-referenced index name like `i` compiled to `get label() { return i }` with `i` unbound — `initChild`'s first read of that prop getter threw at hydration. `component-rooted-inner-loop` (#1725) declared no index params at all, leaving both outer and inner index names unbound the same way.

The fix emits the user's declared index name directly as the `forEach`'s second param — the same idiom the outer loop has always used (`elem.index || '__idx'`) — instead of a synthetic placeholder. No alias binding is needed: `forEach` supplies the real array index positionally.

Byte stability: loops that declare no index param keep byte-for-byte identical output (`__innerIdx` fallback for `inner-loop-nested`, bare single-param `forEach` heads for `component-rooted-inner-loop`). `inner-loop-nested` loops that DO declare an index see the `forEach` param renamed from `__innerIdx` to the user's name, and the child-offset expression (`__ic.children[...]`) follows it — a behavior-neutral rename, not a semantic change.
