---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Run a `ref` callback on an element forwarded as a loop-row child component's own `children` (`rows().map(o => <Chip key={o.id}><input ref={el => register(o.id, el)} /></Chip>)`). The callback was resolved into the loop plan but never emitted, so it never ran. Each hydrated and client-built row of a signal-array loop now invokes it against its own element, reading the row item and index through their accessors. A static-array loop already invoked it. Go-template declares its existing no-rows gap for a signal-array loop with forwarded children on the new fixture.
