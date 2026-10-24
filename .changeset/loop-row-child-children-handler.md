---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Wire an event handler on an element forwarded as a loop-row child component's own `children` (`rows().map(o => <Chip key={o.id}><button onClick={() => pick(o.id)} /></Chip>)`). The handler was collected but never emitted, so the click was dropped. Each hydrated and client-built row of a signal-array loop now attaches it, reading the row item and index through their accessors, and each hydrated row of a static-array loop attaches it with the plain item and index. Go-template declares its existing no-rows gap for a signal-array loop with forwarded children on the new fixture.
