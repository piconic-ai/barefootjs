---
'@barefootjs/jsx': patch
'@barefootjs/blade': patch
'@barefootjs/erb': patch
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
'@barefootjs/mojolicious': patch
'@barefootjs/pebble': patch
'@barefootjs/twig': patch
---

A `.filter()` predicate that captures an enclosing name now keeps reading the enclosing value when the following `.map()` param reuses that name (#3402). Previously the comparison read the loop's own item, so every item passed the filter.
