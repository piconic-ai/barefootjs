---
"@barefootjs/jsx": patch
---

Fix #2758: a controlled `<select value={signal()}>` whose value matches no `<option>` now SSRs an explicit "nothing selected" state instead of the browser's implicit first-option default. `lowerFormControlValueSsr` injects a hidden, disabled placeholder `<option value="">` whenever a single-selection `<select>`'s options are statically enumerable, with `selected` computed as the negation of every real option's match condition — so the initial paint agrees with hydration's `select.value = ...` assignment (which already yielded `selectedIndex = -1` for an out-of-range value), instead of visibly flipping from the first option to nothing the moment hydration runs. `multiple` / `size > 1` selects and `.map()`-rendered option lists are unaffected.
