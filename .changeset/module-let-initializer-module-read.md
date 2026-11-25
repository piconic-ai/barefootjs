---
"@barefootjs/jsx": patch
---

A module `let` the component reassigns whose initializer reads another module const or function (`const seed = ''; let counter = seed || 'x'`) now loads on the client and starts from the module value.

The client script declared the `let` at module level (`var counter = counter ?? (seed || 'x')`) but copied `seed` into the init body, so loading the module threw a `ReferenceError` (or a `TypeError` for a module function the initializer calls) with no diagnostic. The initializer is now evaluated in the module-scope replica, after the module consts and functions it reads, directly or through a chain, and the replica assigns the module-level variable. Such a `let` written only in an event handler or only by a module function takes the same path, so every instance of the component shares the one module binding, as in the module (it used to be a per-instance copy in the init body).
