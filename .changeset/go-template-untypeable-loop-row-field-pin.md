---
"@barefootjs/go-template": patch
---

Make the go-template BF101 for an untyped object-literal loop array name every cause it covers. When the rows share their keys, a field whose value type differs between rows is refused the same way as a nested object, a `null` or a non-identifier key. The message now says so, and its suggestion no longer tells you to use plain literals when they already are plain literals of different types. Both shapes (different keys, and an untypeable field) are now registered as `untyped-loop-array-no-row-struct` with pinned conformance fixtures.
