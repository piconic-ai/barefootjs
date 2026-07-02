---
"@barefootjs/test": patch
---

Resolve literal destructure defaults (`{ size = 'md' }`) in `renderToTest()` (#2071). The framework models the zero-props render, so a bare reference to a defaulted prop now resolves to its literal default in expression attributes (`type={type}` → `'button'`), template interpolations (`` `chip-${tone}` `` → `chip-ok` in `.classes`), and text expressions (`findByText('Hello')` finds `{label}` with `{ label = 'Hello' }`). Inline ternary classNames now union both branches like the intermediate-const path (#525) instead of leaking a `{cond}` placeholder token. Non-literal defaults (arrows, arrays, computed expressions) keep their expression text; signal/memo reads are untouched.
