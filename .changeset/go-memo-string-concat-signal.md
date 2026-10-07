---
"@barefootjs/go-template": patch
---

A memo concatenating a string signal with literals (`createMemo(() => s() + '!')`), or concatenating another such memo, now renders its value on SSR instead of an empty slot. The signal's constructor value joins the Go string chain through `bf.String`. A signal is treated as a plain string when it is declared `string`, seeded with a string literal, or seeded from a required `string` prop.
