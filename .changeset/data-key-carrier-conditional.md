---
"@barefootjs/jsx": patch
---

Fix #2732 for a fragment root whose only top-level child is a conditional. `markDataKeyCarrier` located the carrier with a flat `children.findIndex(c => c.type === 'element')`, which returns -1 for `<>{done ? <li class="done"/> : <li/>}</>` — the elements live in the `IRConditional`'s `whenTrue`/`whenFalse`, never as siblings. `carriesDataKey` was therefore never set on either branch and SSR omitted `data-key` entirely, reproducing #2732's own symptom for a single-visual-root shape the fix was meant to cover (distinct from the multi-root gap, which stays declared).

The search now descends through `conditional` and marks BOTH branches. They are mutually exclusive at render time, so whichever is taken carries the key; marking only `whenTrue` would drop it exactly when the condition is false. The `fragment-root-conditional-loop-row` fixture pins both polarities for that reason — one row with `done: true`, one with `done: false`.
