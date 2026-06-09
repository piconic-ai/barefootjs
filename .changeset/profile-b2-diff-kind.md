---
"@barefootjs/jsx": patch
---

fix(profile): add `kind: "diff"` discriminator to compile-diff JSON (#1849 B2)

`BudgetDiff` now carries a `kind: "diff"` field so JSON consumers can distinguish a zero-delta diff ("no change") from a pure-static component with no reactive state.
