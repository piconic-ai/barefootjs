---
"@barefootjs/jsx": patch
---

Keep text in a conditional branch and attributes like `hidden` bound when they read state through a call the compiler can't see into. An example is `v()` reading a store held in a class instance or an untyped prop. Text inside a branch now gets the same `createEffect` fallback as text outside it, so it no longer keeps its first value until the condition flips. An element whose only dynamic part is such an attribute now gets a slot id, so the attribute is applied and updated on the client.
