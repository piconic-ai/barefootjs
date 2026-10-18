---
"@barefootjs/jsx": patch
"@barefootjs/erb": patch
---

Only a read of the component's own `children` prop is spliced as raw markup. A local `const children`, a loop row named `children`, or another object's `.children` is now escaped text in the client template and in ERB, where it used to be inserted as HTML. A `children ?? '<fallback>'` read escapes the fallback.
