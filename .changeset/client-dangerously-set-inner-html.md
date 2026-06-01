---
"@barefootjs/jsx": patch
---

Implement `dangerouslySetInnerHTML={{ __html }}` on the client. Previously the client codegen treated it as a generic reactive attribute, emitting a bogus `dangerouslySetInnerHTML="[object Object]"` and never setting `innerHTML`, so a `"use client"` component rendered nothing on the client (a silent SSR/CSR mismatch). The client now mirrors the SSR adapters: the `{ __html }` object is suppressed as an attribute, its value is emitted as the element's raw (unescaped) content in the template, and a reactive value also drives an `innerHTML` assignment in init. This is the intentional raw-HTML escape hatch — values are NOT escaped, by design.
