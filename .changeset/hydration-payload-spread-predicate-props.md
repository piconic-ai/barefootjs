---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
---

The hydration payload (`bf-p`) now carries every prop the client JS reads. Before, it missed keys the component reached only through a spread: a closed-type `{...rest}` spread onto an element or a child (Hono and Go template), and a whole `{...props}` or open `{...rest}` spread (Hono emitted no `bf-p` at all for a component that only forwards its props). Hydration then read those keys as undefined and removed the server-rendered attributes. Hono also left out a data prop whose name starts with `on` (`one`, `only`, `once`); only `on` followed by an uppercase letter is an event handler.

The client template now reads a destructured prop used only inside a loop's `.filter()` predicate as `_p.<key>`. It emitted the bare local name, so a client-side mount threw a `ReferenceError`.
