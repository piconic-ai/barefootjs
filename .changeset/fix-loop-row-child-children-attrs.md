---
"@barefootjs/jsx": patch
---

A child component rendered in a keyed loop row forwarded its JSX `children` element with reactive attributes (`<Cell><span class={row.active ? 'on' : 'off'} /></Cell>`), but those attributes were never patched after hydration: the row's per-item effects only reached the child component itself, not the element it forwarded. The component-loop plan now emits the forwarded children's reactive attribute effects against the child's scope, and stops the row-level `reactiveEffects` from double-patching a nested child's forwarded text, which the child's own init already patches. The `loop-row-child-children-attrs` fixture is the regression test.
