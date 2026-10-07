---
"@barefootjs/go-template": patch
---

Attribute values holding an arithmetic result, a ternary with an arithmetic branch, or a boxed numeric memo now print with the JavaScript number spelling (`data-sum="1234567890.5"`), as text position already did, instead of Go's exponent form (`1.2345678905e+09`).
