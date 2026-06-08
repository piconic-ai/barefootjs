---
"@barefootjs/jsx": patch
---

Complete profile-mode turn markers on the loop-cond arm path (#1690, closes #1786).

The last uncovered handler path — a conditional inside a loop item whose arm
holds an event handler (`items.map(it => it.on ? <button onClick/> : …)`) —
now gets `beginTurn`/`endTurn` like every other path. `profileComponentName` is
threaded through `buildReactiveEffectsPlan` / `buildLoopReactiveEffectsPlan` →
`buildOuterArm` → `buildBranchEventBindingsPlan`, which tags each arm listener
with its turn id; `stringifyBranchEventBindings` passes it to `emitListenerLine`
(already turn-aware). Off by default the emitted code is byte-for-byte unchanged
(SR8); with this, all CSR handler emit paths are covered (#1244 risk-A).
