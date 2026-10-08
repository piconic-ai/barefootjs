---
'@barefootjs/go-template': patch
'@barefootjs/xslate': patch
---

An inner `.map()` index, item param or preamble local named like an outer row's binding now shadows it only inside the inner row (#3392). go-template no longer resolves the name to the outer destructure accessor. Xslate binds the inner local under a renamed Kolon local, because Kolon refuses a `my` or `for` target that redeclares an enclosing one.
