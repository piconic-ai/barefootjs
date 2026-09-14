---
"@barefootjs/jsx": patch
---

Fixes #2985: a cross-file reactive factory that imports and calls `batch` from `@barefootjs/client` compiled clean, but the generated client module's `@barefootjs/client/runtime` import never included `batch` — a bare `batch(...)` call in the emitted bundle threw `ReferenceError: batch is not defined` at hydration.

Root cause: `batch` was missing from `RUNTIME_IMPORT_CANDIDATES` (`ir-to-client-js/imports.ts`), the list `detectUsedImports` scans to decide which runtime helpers the generated client bundle needs to import — every other reactive primitive (`createSignal`, `onMount`, etc.) was already provisioned this way, `batch` alone was never added.
