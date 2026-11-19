---
"@barefootjs/jsx": patch
---

A module function that reads a module `let` the component (or a module function) reassigns and a module name the component hides now reads the module's own binding on the client.

The function was kept in the component scope because the module-scope replica could not declare a reassigned binding, so its read of the hidden name resolved to the component's prop, const, signal or memo with no diagnostic (`g()` logged `prop2` where Hono renders `m2`). The client script now declares the `let` once at module level (`var counter`) and the replica assigns it at its source-order position (`counter = counter ?? <initializer>`), so the function, the component and any module function read and write one binding. A shared `let` initialized from another shared `let`, and a module const that copies a shared `let`, run in module order. This covers a `let` written in the render body, only in an event handler or only by a module function, a `let` without an initializer, an initializer that reads the hidden name, and a component binding that hides the `let` itself.
