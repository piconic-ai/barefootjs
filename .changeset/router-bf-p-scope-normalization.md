---
"@barefootjs/router": patch
---

Normalize the random `scopeID` inside the Go template adapter's `bf-p` props attribute when diffing regions.

The router already blanks the per-render scope id in `bf-s` / `bf-h` and the JS adapters' `bf-scope:` comment so a region isn't flagged as changed just because its island re-randomized its id. The Go template adapter instead carries props (including `scopeID`) in a `bf-p` attribute, which was left untouched — so a persistent sibling region whose island sits *inside* the region element (e.g. a hand-authored `<aside bf-region>` sidebar) compared unequal on every navigation and got swapped, resetting its state. `ownedContentKey` now blanks the `scopeID` field in `bf-p` too (keeping every other prop, so a real prop change is still detected). No effect on the JS adapters, which don't emit `bf-p`.
