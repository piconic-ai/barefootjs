---
"@barefootjs/jsx": patch
---

A signal or memo named like another prop of a bare-props component (`const [label] = createSignal(props.b ?? 'y')` beside `props.label`) no longer shares the prop's template variable on the template adapters. The compiler renames such a binding before building IR, as it already did for a signal seeded from a literal, so the template renders the signal where it reads `label()` and the caller's prop where it reads `props.label`. This also covers names that differ only by case (`Label` and `label`), which Go maps to the same struct field. A signal or memo derived from its own same-named prop keeps its name.
