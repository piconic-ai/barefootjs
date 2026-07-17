---
"@barefootjs/go-template": patch
"@barefootjs/rust": patch
---

Fix #2299: an inline-object-typed prop's nested member access
(`props.cfg.id` where `cfg: { id: number }`) now renders correctly on the
typed struct backends instead of empty. The inline object type bakes as an
untyped map (`map[string]interface{}` on Go), so an exact-case dot path
(`.Cfg.ID`) missed the JS-cased map key. The Go adapter now routes such a
chain through the case-tolerant `bf_get` runtime getter; Rust already
rendered it correctly. The `object-catalogued` render divergence is removed
from both adapters, so the object-synthesis data points now run the oracle
comparison on every backend.
