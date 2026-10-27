---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Wire an event handler on an element forwarded through a child component nested below a `.map()` row element (#3695), such as `<Chip key={o.id}><Chip><button onClick={…}/></Chip></Chip>` or `<div key={o.id}><Chip><button onClick={…}/></Chip></div>`. The row's listener lookup used to stop at the nested component's scope, so the click did nothing. The row's listener now names the nested receivers and the component that authored them, and `qsa` accepts an optional host scope id so it checks those receivers against that component rather than against the row root. A component created inside a forwarded `children` getter on the client (`createComponent` in a client-built row) now gets the same slot identity (`bf-h` / `bf-m` and the derived `bf-s`) that SSR gives it, so a client-built row resolves the handler the same way a hydrated row does.
