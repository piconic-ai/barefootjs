---
'@barefootjs/jsx': minor
---

Cross-file reactive-factory inlining now re-provisions type-only references too (#2350): a factory body that references an imported type only in type position (a return-type annotation, a generic type argument, a variable's type annotation) previously had that reference silently dropped — never captured as a BF112 module-capture hit, never re-provisioned as an import — so `tsc` on the compiled output could fail to resolve the name with zero diagnostic pointing at the cause, even though `bf build` itself stayed green. The component file now gets a separate `import type { ... }` line alongside the existing re-provisioned value imports, deduped against any import already present at the call site.
