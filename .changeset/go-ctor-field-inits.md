---
"@barefootjs/go-template": patch
---

Internal refactor of the Go template adapter: the `New<Name>Props` constructor's prop, signal and memo field initializers (the hoisted `props.X ?? N` locals, sibling-memo hoisting, the prop-field defaults and memo-fallback folds, and the signal and memo seeds) move out of `generateNewPropsFunction` into `props/ctor-field-inits.ts`. Generated templates and Go are unchanged for every fixture and component.
