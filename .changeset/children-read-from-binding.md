---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
"@barefootjs/twig": patch
---

Only a read of the component's own `children` prop is spliced as raw markup. A local `const children`, a loop row named `children`, or another object's `.children` is now escaped text in the client template and in ERB, where it used to be inserted as HTML. A `children ?? '<fallback>'` read escapes the fallback. On Twig, a chained `??` (`(a ?? b) ?? c`) now renders instead of failing template compilation: Twig's native `??` only accepts a variable on its left, so a nested logical is tested with `is null`.
