---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
---

The row bindings that Pebble, Twig and Blade save before a loop and restore after it are now chosen in one place. These backends' `set` is not loop-scoped (#3386, #3391). The new `savedLoopBindings` in `loop-plan.ts` picks each name the row binds that an enclosing row or a template-level name already uses, in the order the template binds them. It also names the temporary that holds the outer value. Each adapter passes only the names it restores itself: the for-header targets from the new `loopHeaderTargets` for Twig and Pebble, and the aliased root props for Blade. It still spells the save and restore lines. Templates and diagnostics are unchanged for every fixture and component source.
