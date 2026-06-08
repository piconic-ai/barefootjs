---
"@barefootjs/jsx": minor
---

Add profile-mode `__bfId` emission to client-JS codegen (#1690, SR3).

A new `CompileOptions.profile` flag makes the client-JS generator append
IR-aligned id arguments at reactive creation sites — `createSignal(init,
"Comp#signal:x")`, `createMemo(expr, "Comp#memo:y")`, `createEffect(body,
"Comp#effect:line")`, including controlled-signal sync effects. The runtime
(`@barefootjs/client`) already accepts these ids, so a profiling run can join
its event stream to IR nodes.

Off by default: when `profile` is unset the emitted code is byte-for-byte
unchanged (SR8). Ids are threaded purely through the declaration-emit plan and
the effects phase; the stringifiers stay `ctx`-free.
