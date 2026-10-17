---
"@barefootjs/go-template": patch
---

An attribute ternary with an `undefined` alternate (`aria-current={props.item?.active ? 'page' : undefined}`) now lowers its parsed test. The test used to be cut at the first `?` of the source text, which broke on `?.`, `??` and a `?` inside a string.
