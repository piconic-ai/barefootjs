---
"@barefootjs/jsx": patch
---

The client template no longer drops a child component prop written as the literal `undefined`. `<Tag {...props} label={undefined} />` and `<Mid label={undefined} />` (where `Mid` spreads its props over an earlier `label`) now pass `label: undefined` to `renderChild(...)`, so the later `undefined` overrides the spread value and the child takes its own fallback, as in the server render. Before, the key was left out and the client render showed the spread's value.
