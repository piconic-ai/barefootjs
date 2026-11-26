---
"@barefootjs/jsx": patch
---

A module-scope array const built with a spread of a literal array const (`const BASE = ['y']; const ALL = [...BASE, 'z']`), or of an inline array literal, now renders on the template adapters as it does on Hono: a memo or signal seed reading it (on Go, a signal seeded with a member of a module array const, spread or not, still bakes `0`), an in-place read (`{ALL.length}`, `{ALL[1]}`), a loop over it and a child prop computed from it see the expanded elements, where they rendered empty (or `0` on Go) before. A spread of anything else (a call, a `Set`, an import) is left as before.
