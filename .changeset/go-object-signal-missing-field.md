---
'@barefootjs/go-template': patch
---

An object signal's missing optional field read where `undefined` is observable (`data-name={user()?.name}`, `user().name ?? 'x'`) now omits the attribute or takes the fallback, instead of rendering the field's zero value. Such fields are now `interface{}` with `omitempty`.
