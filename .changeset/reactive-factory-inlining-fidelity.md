---
'@barefootjs/jsx': minor
---

Fix three reactive-factory inlining bugs that produced silently corrupted or
broken output with zero compile diagnostics (#2341):

- Identifier renames during factory inlining now operate on precise AST
  positions instead of a whole-body regex, so string/template-literal
  contents, property keys, and JSX intrinsic tags that happen to share a
  renamed name are no longer corrupted. A factory parameter shadowed by a
  nested declaration inside the body can no longer be silently substituted
  with an invalid expression — it now declines with a new diagnostic,
  **BF114**.
- Cross-file factory resolution now follows one `export ... from` hop
  through a barrel `index.ts` file, so `export { useToggle } from
  './useToggle'` re-exports resolve to the real factory instead of silently
  falling through to a dangling reference at runtime.
- `detectReactiveFactory` now counts `return` statements anywhere in the
  body (not just at the top level), so a guard-clause `return` nested
  inside `if`/`try`/a loop correctly declines the factory instead of being
  spliced into the component's init function as an inert early return.
