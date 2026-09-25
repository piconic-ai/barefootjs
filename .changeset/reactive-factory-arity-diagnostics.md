---
"@barefootjs/jsx": patch
---

Report two `createSignal` / `createMemo` call shapes that used to compile silently wrong. BF115: a tuple destructure whose arity does not match the primitive, such as `const [a, b, c] = createSignal(0)` or `const [a, b] = createMemo(...)`. BF116: extra arguments, which were dropped from the emitted client JS. `createSearchParams()` counts as taking no arguments.
