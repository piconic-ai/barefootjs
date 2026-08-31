---
"@barefootjs/jsx": patch
---

Fix a controlled `<textarea>`'s value breaking out of the element when its
row is rebuilt by the reconciler.

`lowerFormControlValueSsr` lowers a controlled `<textarea>`'s value into
element content, and attaches two forms of the expression precisely so the
client side can escape it while SSR adapters (whose template engines
escape text children natively) keep the clean form. The loop-row and
conditional-branch builders in `ir-to-client-js/html-template.ts`
interpolated the SSR form into an `innerHTML` string instead, so a value
containing `</textarea>` closed the element early on a row the reconciler
rebuilds, promoting the remainder of the value into live DOM. Observed in
a real browser: the value itself reads back intact (a per-row binding
repairs it), so only the injected element betrays the defect — asserting
just the value is not enough to catch this class of bug.

The IR now carries an explicit `escapeInClientTemplate` flag on the
expression node, set only where a lowering has moved a value into element
content this way. The affected builders wrap the value in `escapeText(...)`
when the flag is set, without swapping which binding they read — the SSR
form's expression text is still the correct one to evaluate in the
builder's own scope, only its output needs escaping.
