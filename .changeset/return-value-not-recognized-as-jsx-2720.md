---
"@barefootjs/jsx": patch
---

Fix #2720: a component whose render is bound to a local `const`/`let` and returned by name (`const __root = <jsx/>; return __root`, or the block-scoped variant `{ const __root = <jsx/>; return __root }`) used to produce `{files: [], errors: []}` — neither sound (nothing emitted) nor loud (nothing reported), since return position never resolves an identifier through its initializer the way JSX-child position does. Now reports **BF027** instead of silently dropping the component. The `blockBody` mutation the #2481 mutation sweep applies to every corpus fixture reproduced this identically (41/41, `refused=0`); this fix flips them all to `refused` under the sound-or-loud trichotomy. The faithful fix — actually resolving the identifier so the component compiles — is tracked separately by #2720.
