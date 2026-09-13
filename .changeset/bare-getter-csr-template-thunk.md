---
"@barefootjs/jsx": patch
---

Fixes #2924: a component prop whose value was (or contained) a bare — uncalled — reference to a local signal or memo getter (`<Display value={count} />`) compiled cleanly but threw a `ReferenceError` at runtime whenever the parent mounted fresh on the client (a new loop row, a portal, a conditionally-mounted subtree — any `createComponent(...)` call not going through SSR + hydration). Hydration of SSR-rendered markup was unaffected.

Root cause: `csrSubstitute` (`packages/jsx/src/ir-to-client-js/csr-substitute.ts`) registers signal getters and memos only as call-kind substitution entries, matching the called form `count()`. A bare reference to the same name never matched that check, so it passed through untouched and leaked the source-level identifier straight into the module-scope `template` lambda, which has no closure over `initCounter`'s local `count`.

Now a bare reference to a call-kind entry substitutes to a thunk over the same value the call form produces (`(() => (5))`) — the CSR-template mirror of the reference (Hono) adapter's own SSR shim for this shape (`const count = () => 5`). This also fixes a related silent-wrong-output case found while designing the repro: a local `const` object literal containing a getter (`const obj = { v: count }`) previously froze `{ v: undefined }` into its CSR-inlined value instead of resolving `count`.
