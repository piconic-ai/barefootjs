---
"@barefootjs/client": patch
---

Fix a client component whose render root is a single CHILD COMPONENT call (a comment-scoped root, #3277) never wiring up that child's own event listeners or reactive bindings — a reactive keyed-array prop never created its first row on an empty → non-empty transition, and no click handler the child declared on its own root ever fired, whether the component was hydrated or CSR-mounted (e.g. as a `.map()` row or inside a conditional branch swap).

The comment scope's registered proxy element is, in this shape, ALSO the child's own real `[bf-s]`-addressable scope root. `find()`'s (and `findCondTarget()`'s) comment-scope candidate filter in `packages/client/src/runtime/query.ts` had no rule for "the candidate's nearest `[bf-s]` ancestor IS the scope we're searching" — only for "no ancestor" or "an ancestor outside our range" — so every one of the child's own slots was misclassified as belonging to a different, nested child scope and silently dropped. `belongsToCommentScope()` adds that rule, mirroring the `nearestScope === scope` acceptance `belongsToScope()` already used on the non-comment-scope path.
