---
"@barefootjs/jsx": patch
---

Fix #2861: a `.map()` row's text/attribute/conditional binding that reads only the loop's index parameter — with no signal, memo, prop, or function call anywhere in the expression (e.g. bare `{i}`, `class={i % 2 === 0 ? 'even' : 'odd'}`) — was compiled as static and never got a `createEffect`, so it went stale after a keyed reorder even though `mapArray`/`mapArrayLazy` already re-run row callbacks with the row's current index on every reorder (fixed for signal-and-index-mixed expressions by #2859/#2860). `classifyReactivity` now recognizes an index-only expression as its own reactivity source (`loop-index`) so it gets a patchable slot like any other reactive binding; the existing eager/lazy row-update machinery already knew how to keep an index-driven slot current and needed no changes.

Also fixes the same staleness for a nested loop's binding that reads an **ancestor** loop's own index (not its own) — `collectInnerLoops` now threads a stacked `BindingScope` through arbitrary nesting depth instead of only seeing the immediate parent, and the composite-loop/conditional-branch-arm plan and stringify layers thread the ancestor index through the second, separate component-prop/event-handler wrap pass so it is wrapped consistently with text/attribute bindings.
