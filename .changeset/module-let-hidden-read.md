---
"@barefootjs/jsx": patch
---

A module function that reads a module `let` the component reassigns and a module name the component hides now reads the module's own binding on the client.

The function was kept in the component scope because the module-scope replica could not declare a reassigned binding, so its read of the hidden name resolved to the component's prop, const, signal or memo with no diagnostic (`g()` logged `prop2` where Hono renders `m2`). The replica now evaluates the `let`'s initializer where the module's names are visible and the client script declares the variable once at module level from that value, so the function and the component read and write one binding. This covers a `let` written in the render body or only in an event handler, a `let` without an initializer, an initializer that reads the hidden name, and a component binding that hides the `let` itself.
