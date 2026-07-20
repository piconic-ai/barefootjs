---
'@barefootjs/jsx': patch
---

Internal cleanup of the `toLocaleDateString` client-JS rewrite serializer: rename `patternArgToClientJs` to `foldedArgToClientJs` (it serializes both the pattern and the #2334 names-table arguments), drop an unreachable duplicate kind check, and hoist the right-fold leaf validation ahead of the recursive descent. No behavior change; the function is module-internal to the compiler (not re-exported from the package index).
