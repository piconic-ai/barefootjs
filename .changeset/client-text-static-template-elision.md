---
"@barefootjs/jsx": patch
---

Fix a SSR/CSR byte-parity violation where a `/* @client */` text expression on a bare destructured prop (e.g. `{/* @client */ createdAt.toISOString()}`) had its value inlined directly into the static/CSR client-JS template instead of being elided to an empty region like SSR. `irToComponentTemplateWithOpts`'s `'expression'` case now nests the same `clientOnly && slotId` / `markerless` elision branch `generateCsrTemplateWithOpts` already had.
