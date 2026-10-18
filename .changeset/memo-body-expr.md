---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A memo whose callback is a `function` expression or a parenthesized arrow (`createMemo(function () { return count() * 10 })`) now renders its value in the CSR template and in Go SSR. The analyzer records the memo's value expression from the callback node (`MemoInfo.bodyExpr`), and consumers no longer match `() =>` in the callback text.
