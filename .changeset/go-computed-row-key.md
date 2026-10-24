---
"@barefootjs/go-template": patch
---

Stamp `data-key` on component loop rows the constructor builds from an array prop when the key is the index (`key={i}`) or an expression of the row and index: `String(x)`, `x.toString()`, a template literal, or `+` with operands of known type (`r.id + '-' + i`, `r.n + i`). Before, these rows rendered with no `data-key`. A row key the constructor can't lower, such as one reading outer state (`key={props.prefix + n}`), is now refused with BF101 instead of rendering the rows without their key.
