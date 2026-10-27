---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Wire an event handler inside an inner loop of a loop-row child component's forwarded `children` (`rows().map(o => <Chip key={o.id}><ul>{o.tags.map(tag => <li key={tag}><button onClick={() => pick(o.id, tag)} /></li>)}</ul></Chip>)`). The handler was dropped, so the click did nothing. Each hydrated and client-built row of a signal-array loop, and each hydrated row of a static-array loop, now runs the same inner-loop setup as an element row, which claims the rendered inner rows and attaches the handler, including one inside a conditional of the inner row. That shared inner-loop setup also now reads the outermost row's item in a handler two loops down (it read the item accessor itself, so `o.id` was `undefined`), and keeps an inner `.filter()` / `.toSorted()` chain (it reconciled the unfiltered array and re-added the filtered-out rows after hydration). Go-template declares its existing no-rows gap for a signal-array loop with forwarded children on the updated fixture.
