---
"@barefootjs/jsx": patch
---

Fix #2771: `import * as bf from '@barefootjs/client'` followed by `bf.createSignal(0)` (or any other reactive primitive — createMemo/createEffect/onMount/onCleanup/createSearchParams — accessed off the namespace binding) compiled with zero diagnostics, but the analyzer's fast-path primitive detection only recognizes a bare identifier callee. The checker-based slow path that DOES resolve a namespace-qualified call only runs when a shared `ts.Program` is supplied (`CompileOptions.program`, which `@barefootjs/vite` always provides) — without one, the declaration was silently dropped from the compiled output and every reference to it threw `ReferenceError` at hydrate.

New `BF013` diagnostic (`validateNamespaceQualifiedPrimitives`, `analyzer.ts`) refuses loudly instead, gated on non-recognition rather than on the namespace-import shape itself — a compile that supplies a program is untouched, since `resolvePrimitiveKind`'s checker-aided path already lowers the shape correctly there. Suggests importing the primitive by name as the fix. Adds the `namespace-import-primitive` fixture (pinned identically across all nine adapters, since the refusal fires ahead of any adapter's `generate()`) and its named-import escape twin.
