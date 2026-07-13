---
"@barefootjs/go-template": patch
---

Fix `test-render`'s prop-to-Go-literal string emission: string props were interpolated into the generated `main.go` with quote-only (or no) escaping, so a `"`, backslash, or newline in a prop value broke the render harness at Go compile time. All four emission sites now share `goStringLit` (`JSON.stringify`, whose escapes are a subset of Go's interpreted-string-literal escapes). Found by the data-point oracle conformance pilot (`spec/subset-conformance.md`): the `html-in-label` adversarial point passes on real Go after the fix.
