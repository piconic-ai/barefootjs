---
"@barefootjs/jsx": patch
---

A signal or memo that shares its name with a prop and transforms that prop (`createSignal(String(props.seed ?? 'none') + '!')`, a template literal, a ternary, arithmetic, a method call, `(props.x || 'a') + 'b'`) now keeps the transformation on go-template, which rendered the raw prop (`a` for `a!`, and nothing when the prop was absent). Phase 1 now keeps a same-named binding on the prop's template variable only when its seed passes the prop through, as `SignalInfo.propSeed` reads it: the bare read (`props.seed`) or its `??` / `||` fallback (`props.seed ?? 'x'`). Every other self-derived binding is renamed (`bfSignal_seed`, `bfMemo_seed`) before IR is built, the way a binding beside a raw read of the prop already was, so each backend seeds it from its own initializer. A block-bodied memo (`createMemo(() => { return props.x ?? 'k' })`) is renamed too.
