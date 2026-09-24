---
"@barefootjs/client": patch
---

Signal writes now propagate in two phases — every affected effect and memo is marked first, then each one is brought up to date, pulling the memos it reads before it runs — so an effect behind a diamond (one signal read through two memos) runs once per write and always sees both memos already recomputed, with or without `batch()`, and a memo read right after a write (inside an effect or inside `batch()`) returns the recomputed value. Writes made from outside any effect still update every subscriber and the DOM before the setter returns, but a write made inside an effect body (including a `batch()` nested in one, such as a list reconcile's per-row updates) now re-runs its subscribers — and applies the DOM updates they make — after that effect returns instead of re-entrantly inside it.
