---
"@barefootjs/jsx": patch
---

Fix three CSR-template scope leaks (#2468) — init-scoped bindings no longer reach the module-scope `template:` lambda

The `hydrate('X', { template: (_p) => ... })` lambda runs at module scope, so
any init-scoped identifier it references is a guaranteed `ReferenceError` on
CSR mount. The adapter-tests client-JS scope gate inventoried three silent
emission paths that leaked them; all are fixed:

- **Memo bodies inlined into the template** kept bare destructured-prop refs
  (`(value * 10)` instead of `(_p.value * 10)`). `MemoInfo` now carries
  `templateComputation` — the memo twin of the signal `templateInitialValue`
  rewrite (#2265) — and `buildSignalMemoEnv` splices that form.
- **Component props built from const-resolved template literals** collapsed
  to an `expression` AttrValue whose `templateExpr` was never populated (the
  derivation walked the original `classes` identifier, which has no prop
  refs), so `renderChild('Slot', { className: \`... ${className}\` })` leaked
  the bare prop. The collapse now projects the parts' template variants
  (`templateValue`/`templateCondition`/`templateKey`) into `templateExpr`,
  and the `irToHtmlTemplate` renderChild site picks the template variant like
  its two sibling emit sites already did. `ref` callback props are dropped
  from module-scope `renderChild(...)` props the same way `on*` handlers
  are — a function prop cannot run during string rendering, and the leaked
  closure referenced init-scope setters.
- **Getter-elided signals** (`const [, setActive] = createSignal(0)`) were
  rejected by the analyzer's binding-pattern guard, dropping the declaration
  from init entirely while emitted handlers still called the setter. The
  analyzer now accepts the hole (synthesizing an internal getter name for
  getter-keyed consumers) and emit reproduces the source's `[, setter]` form.

Graduates seven fixtures from the scope-gate ledger (button, tooltip, kbd,
command, map-index-handler, reactive-props, props-reactivity-comparison);
the remaining entries are #2075 (env-signal getter contract) and #2463
(early-return branch lowering), tracked separately.
