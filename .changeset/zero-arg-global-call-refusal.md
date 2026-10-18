---
'@barefootjs/jsx': patch
---

A zero-argument call on a JavaScript global in a template position (`Date.now()`, `Math.random()`, `performance.now()`), directly or through a component-scope const the template reads, now refuses with BF101 on every template adapter. The adapters used to read it as a member value (`Date['now']`, `.Date.Now`) and render empty with no diagnostic. A zero-argument getter read (`props.value()`, a context getter `ctx.open()`) still renders as before. Wrap the position in `/* @client */` to evaluate it in the browser, or pass the value as a prop. `ui/sidebar`'s `SidebarMenuSkeleton` now evaluates its random `max-width` with `/* @client */`, which also stops the server and the browser from picking different widths.
