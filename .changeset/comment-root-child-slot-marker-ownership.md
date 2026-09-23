---
"@barefootjs/client": patch
---

Fixed `claimSlots`/`lazySlots`'s fallback marker scan silently dropping a reactive text/markup slot update for a "root is a single child-component call" comment-scoped component (`root.type === 'component'`, #2649) whose own child is itself a wrapping element. That child mounts on the same DOM element the hydration walker registers as its ancestor's comment-scope proxy, so the element is both registered under the ancestor's scope id and carries the child's own, different `bf-s`. The ownership-rejection boundary now stays at the claim root itself whenever it carries its own `bf-s`, instead of walking out to the ancestor's comment parent and rejecting the child's own marker as "belongs to a nested scope" (#3122).
