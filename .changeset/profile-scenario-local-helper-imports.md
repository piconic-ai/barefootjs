---
"@barefootjs/cli": patch
---

fix(cli): `bf debug profile --scenario` failed with a raw `Cannot find module`
for any component importing a local plain (non-component) module (#1873)

The scenario driver writes the joined client chunks to a temp file before
importing them, but a plain `.ts` helper emits no client JS — its compiled
result is discarded while the `import { x } from '../lib/helper'` line survives
verbatim and resolves (and fails) against the temp directory. Relative imports
in each chunk are now rewritten before the run: an import of a file whose
compiled client JS is already concatenated into the run is dropped (the chunks
share one module scope), and an import of a plain local module is rewritten to
the absolute path of the original source, which bun loads directly. A relative
specifier that resolves to no file at all now throws an actionable error
instead of bun's raw module-resolution stack.
