---
"@barefootjs/jsx": patch
---

New diagnostic BF049: refuse at compile time when a prop provably typed as a JSON-unsafe host rich type (`Map`, `Set`, `BigInt`, `RegExp`, …) is used anywhere in the component's own client code (a handler, an effect), regardless of whether a method is called on it. Before this, only a *method call* on such a prop in a template-lowered position was caught (BF021, #2273) — BF021 never analyzes handler/effect bodies at all, so a prop merely read there, or even method-called there (e.g. `data.get(...)` inside an `onClick`), still silently crossed the `bf-p` hydration boundary, where it either threw (`BigInt`) or de-serialized to `{}`/`null` with no diagnostic. `checkRichTypePropSerialization` (`packages/jsx/src/rich-type-refusal.ts`) is BF021's sibling for this "client-side use" shape.
