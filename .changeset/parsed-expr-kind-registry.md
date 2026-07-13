---
"@barefootjs/jsx": patch
---

Export `PARSED_EXPR_KINDS` — a runtime registry of every `ParsedExpr` kind, exhaustiveness-pinned against the type union (adding a kind without listing it fails to compile). It is the denominator for the conformance coverage ledger (`spec/subset-conformance.md`): fixture coverage maps and the ledger-floor meta-test compute against this list.