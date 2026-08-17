---
"@barefootjs/jsx": patch
---

New diagnostic BF049: refuse at compile time when a prop provably typed as a JSON-unsafe host rich type (`Map`, `Set`, `BigInt`, `RegExp`, …) is read by the component's own client code with no method call involved. Before this, only a *method call* on such a prop was caught (BF021, #2273) — a prop that was merely read and passed through untouched still silently crossed the `bf-p` hydration boundary, where it either threw (`BigInt`) or de-serialized to `{}`/`null` with no diagnostic. `checkRichTypePropSerialization` (`packages/jsx/src/rich-type-refusal.ts`) is BF021's sibling for this "untouched passthrough" shape.
