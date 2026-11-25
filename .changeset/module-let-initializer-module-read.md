---
"@barefootjs/jsx": patch
---

A module `let` a top-level statement of the component reassigns whose initializer reads another module const or function (`const seed = ''; let counter = seed || 'x'`) now loads on the client and starts from the module value.

The client script declared the `let` at module level (`var counter = counter ?? (seed || 'x')`) but copied `seed` into the init body, so loading the module threw a `ReferenceError` (or a `TypeError` for a module function the initializer calls) with no diagnostic. The initializer is now evaluated in the module-scope replica, after the module consts and functions it reads, directly or through a chain, and the replica assigns the module-level variable.

A module const initialized from such a `let` that also calls a module function (`const initial = count + offset()`) now has the function declared beside it in the replica; it threw `ReferenceError: offset is not defined` on load.

The wider replica is taken all or nothing: when what it would evaluate reaches a declaration it cannot host (a `createContext`, a `new WeakMap()`, a bare `let` nobody writes, a JSX const) or an initializer evaluated at module level ahead of it (a context, a shared `let`, a `/* @client */` module signal or memo, directly or through a module function) reads one of its bindings, the client script is unchanged from before. A `let` whose initializer reads a context and a module const therefore still fails to load.
