---
"@barefootjs/jsx": minor
---

Batch-advisor safety oracle — post-write-derived-read (#1690, §4.2.3, closes #1790).

`assessBatchSafety` upgrades a batch candidate from `'unverified'` to `'safe'`
or `'unsafe'` by static analysis of the handler body, and `buildProfileReport`
applies it per candidate (pairing the turn id to its `EventBinding` by source
line). A `batch()` wrap defers effect flush; since a memo is a push-effect that
writes a private signal, a memo read *after* a write to one of its dependencies
returns a stale value under batch. So the wrap is safe iff no such read happens.

Conservative by construction — only `'safe'` when provably so: indirect setters
(`via` a helper) or an unknown call after a write yield `'unverified'`; a
downstream-memo getter read after the first write yields `'unsafe'`; signal
reads are fine (`set()` updates the value synchronously). The report now reads
`click@s0 batch candidate 4→2 (saves 2, safe) (Form.tsx:10)`.
