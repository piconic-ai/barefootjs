---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Template adapters: a boolean that reaches an output through a memo, a signal seed or a local constant now renders as the same boolean read directly does: nothing as a text child, `true` / `false` in an attribute. The operand typing read such a value's type off the last operand of its initializer (`createMemo(() => props.no ?? 'x')` was a `string`), so every template adapter printed `false`, and Mojolicious and Xslate `0`. It now reads what the initializer proves from its operands (`??`, `&&`, `||`, a ternary, a comparison, a getter read), in declaration order, so a memo over a memo or a local constant is typed too. A signal or memo without a declared type is typed the same way, so an operator over one whose initializer is a proven number or string (`createSignal(initial)` with `initial = 0`) is spelled natively instead of through the runtime helper.

Go template: a signal or memo field takes that type instead of the last operand's, and a `props.x ?? fallback` seed over an `interface{}` prop field applies the fallback when the prop is nullish instead of comparing it with the fallback type's zero value. Mojolicious and Xslate: a loop row's union-typed member (`data-v={r.v}` with `v?: string | number | boolean | null`), a boolean row member and a boolean memo in an attribute print `true` / `false` instead of `1` / `0` (#3789).
