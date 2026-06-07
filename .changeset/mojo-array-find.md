---
"@barefootjs/mojolicious": patch
---

Lower `Array.prototype.find` / `.findIndex` / `.findLast` / `.findLastIndex` on the Mojolicious adapter, graduating the `array-find` / `array-findIndex` / `array-findLast` / `array-findLastIndex` conformance fixtures (previously pinned to BF101).

The runtime helpers (`bf->find` / `find_index` / `find_last` / `find_last_index`) already existed and the Xslate adapter already lowered these via a Kolon lambda; only the Mojo `higherOrder` emitter still refused them. It now emits `bf->find($arr, sub { my $x = $_[0]; <pred> })` (a per-element coderef predicate, the same shape as `.filter` / `.some` / `.every`), with the camelCase JS names mapping to the snake_case helpers. Verified against real Mojolicious; Hono reference snapshots unchanged.
