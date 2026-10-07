---
"@barefootjs/xslate": patch
---

A `.map()` callback whose item or index param has the same name as a component memo (`props.rows.map(label => …)` beside `const label = createMemo(…)`) now renders on Text::Xslate instead of failing to parse (`Expected '{', but got '$label'`). Such a memo is declared and read under its own Kolon local (`$__bf_memo_label`), so the row param shadows it only inside the row, as in JavaScript.
