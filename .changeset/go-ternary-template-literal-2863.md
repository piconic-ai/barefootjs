---
"@barefootjs/go-template": patch
---

Fix #2863: a ternary (or `+`/`||`/`??` operand, or a `queryHref`-style helper argument) whose branch was a multi-part template literal (e.g. `` event.endTime ? `${event.time}–${event.endTime}` : event.time ``) emitted invalid Go template syntax — nested `{{…}}` action delimiters inside another action's pipeline argument list (`(bf_ternary … {{.Time}}–{{.EndTime}} …)`). `bf build` succeeded, but the generated `.tmpl` file failed `html/template.Parse` at Go application startup with `unexpected "{" in operand`.

The Go adapter's ternary/operand lowering now folds a template literal used in this VALUE position into a single Go pipeline value via a left-folded `bf_concat_str` chain (the same runtime helper already used for JS string-concatenation `+`), instead of routing it through the TEXT-position `templateLiteral()` emitter (mixed literal text plus `{{…}}` action wraps), which is only safe when spliced directly into markup. A per-row child-component prop reading a multi-part template literal — previously refused outright with `BF101` — now lowers faithfully through the same path instead.
