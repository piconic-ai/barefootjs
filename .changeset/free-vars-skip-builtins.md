---
"@barefootjs/jsx": patch
---

`freeVarsInBody` no longer captures builtin call callees (`Math.<fn>`,
`String` / `Number` / `Boolean`) as free variables. The evaluator resolves
those syntactically, so emitting them into a callback's `base_env` produced an
undefined template reference (`$Math` / `.Math`) for any comparator / reducer /
predicate body that called a builtin — e.g. `(a, b) => Math.abs(a) - Math.abs(b)`
(Copilot review #2031). The arguments of such a call are still real references
and remain captured. Latent until now because no shipped fixture used a builtin
inside a serialized callback body; the fix covers both the Go and Perl
evaluator-emit paths.
