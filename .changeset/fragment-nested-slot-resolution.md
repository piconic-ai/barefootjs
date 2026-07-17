---
"@barefootjs/client": patch
---

Fix #2302 (a gap left by the #2289/#2293 fix): a fragment-rooted child component's own `$`/`$t` queries failed to resolve any slot nested inside one of the fragment's top-level siblings (e.g. `<header><select>`), because `find()`'s comment-scope acceptance check rejected any candidate with a `bf-s`-attributed ancestor — which every fragment child mounted inside a normal parent island always has. Separately, a *parent's* own slot search could wrongly claim a descendant that actually belonged to a nested fragment child's coincidentally same-numbered slot (e.g. a parent's `bf="s5"` collapse button vs. the fragment child's own unrelated `bf="s5"` element), because `belongsToScope()`'s `.closest('[bf-s]')` walk has no element to stop at for a fragment child's comment-anchored scope. Both are now resolved by bounding the search to the actual `<!--bf-scope:...-->` … `<!--bf-/scope:...-->` sibling range instead of relying on `.closest('[bf-s]')` alone.
