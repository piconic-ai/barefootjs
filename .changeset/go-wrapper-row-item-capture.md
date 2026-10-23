---
"@barefootjs/go-template": patch
---

Bind the calling row's own variable in a forwarded-children define of a loop-row child when the children read it from a nested loop, such as a `.filter()` predicate that compares against the outer row (`o.tags.filter(t => t !== o.label)`). The template used to read an unbound `$o` and fail to parse.
