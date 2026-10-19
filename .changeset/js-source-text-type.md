---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

The IR's JS source-text fields (`IRExpression.expr`, `MemoInfo.computation`, `SignalInfo.initialValue`, `IREvent.handler`, a loop's `array` and `key`, …) are typed `JsSourceText`, a flavor of `string` exported from `@barefootjs/jsx`. A plain string is still assignable, so no caller changes. Types only; no output changes.
