---
"@barefootjs/jsx": patch
---

`popover` (a global attribute, `'' | 'auto' | 'manual' | 'hint'`) is now typed on `HTMLBaseAttributes`, and `popovertarget`/`popovertargetaction` are typed on `<button>` and `<input type="button">`. Previously these Popover API attributes were untyped, so writing them in JSX failed type-checking and the ref-callback escape hatch was refused by BF063 (the ref writes an attribute the JSX never renders). With these types, the attributes can be written directly in JSX — no `@ts-expect-error` or `ref` workaround needed. `popover` intentionally has no `boolean` arm: `popover` isn't in the boolean-attribute set, so a boolean value stringifies instead of toggling the attribute (`popover={false}` would render the invalid keyword `"false"`, which the spec maps to `manual` — the element would still be a popover, not opted out — and the client runtime disagrees by removing the attribute outright, an SSR/CSR mismatch).
