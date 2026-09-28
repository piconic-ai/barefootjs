---
"@barefootjs/jsx": patch
---

`popover` (a global attribute, `'' | 'auto' | 'manual' | 'hint' | boolean`) is now typed on `HTMLBaseAttributes`, and `popovertarget`/`popovertargetaction` are typed on `<button>` and `<input type="button">`. Previously these Popover API attributes were untyped, so writing them in JSX failed type-checking and the ref-callback escape hatch was refused by BF063 (the ref writes an attribute the JSX never renders). With these types, the attributes can be written directly in JSX — no `@ts-expect-error` or `ref` workaround needed.
