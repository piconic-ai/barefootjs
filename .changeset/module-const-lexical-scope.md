---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Module consts keep module scope, and a component binding of the same name hides one inside the component only.

- A component const named like a module const (`const x = 'module'` beside a component `const x = 'local'`) no longer makes the client script fail to load with `"x" has already been declared`. A read in the component is the component const on the server render and on the client.
- A module const whose initializer reads a name the component also binds (a prop, a const, a signal, a memo) keeps the module value. On the Hono render it was moved into the component and read the component's binding; in the client script it was copied into the init body with the same result. The client script now evaluates such consts once in a module-scope replica (`__bf_module_<Component>`) and reads its members; a file where no name is shared is emitted as before.
- A module function that reads a module const the component hides returns the module value on the client, and a component function named like a module function hides it there.
- A module const declared after the component that reads it is declared in the Hono template and the client script (it was `late is not defined`).
- A bare read of a name resolves to the component's declaration on every template adapter: `{z}` beside a module `const z = 'mz'` and a component `const z = 'lz'` (or a prop `z`) rendered the module literal.
- A module function that reads a module const the component writes (a mutated object) is no longer moved into the module-scope replica, even when another module helper that reads a hidden name pulls it in. It stays in the component's script next to the const it reads, so reads and writes share one storage.
