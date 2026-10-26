---
"@barefootjs/go-template": patch
---

Test-only: the conformance harness builds each throwaway render binary with `-ldflags=-s -w`, skipping the symbol table and DWARF that a binary run once and deleted never reads (one fixture's build went from ~0.37 s to ~0.28 s in the measurement on #3671). Generated templates and Go are unchanged.
