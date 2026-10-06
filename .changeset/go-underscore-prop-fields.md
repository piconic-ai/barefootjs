---
"@barefootjs/go-template": patch
---

A prop whose name starts with `_` (such as `_value` or `__bf_root_value`) now renders on go-template. The leading underscore used to survive into the generated struct field, which made it unexported, so `html/template` failed at render time. Such a prop now gets an `X`-prefixed exported field (`__bf_root_value` → `X__bf_root_value`) on the Input and Props types, in the constructor and in template reads. The serialized prop key keeps its original spelling. Two props that map to the same Go field (for example `x_a` and `_a`) are now refused at compile time with BF101 instead of producing Go that does not compile.
