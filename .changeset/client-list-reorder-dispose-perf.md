---
"@barefootjs/client": patch
---

Performance: `mapArray` now reorders keyed lists with minimal DOM moves (LIS-based — a two-row swap moves two scopes instead of re-inserting every row), batches contiguous new rows through a `DocumentFragment`, clears emptied lists in bulk via `Range.deleteContents()`/`textContent`, and caches its loop boundary markers between updates. Effect disposal bookkeeping is now O(1) per child (lazily-allocated insertion-ordered `Set` instead of `indexOf`+`splice`), removing an O(n²) cost when disposing large lists. No behavioral changes: keyed reconciliation semantics, cascade-disposal order, hydration, multi-root items, and focus preservation are unchanged and covered by new regression tests.
