---
"@barefootjs/jsx": patch
---

New compile error BF063: an element's `ref` callback that unconditionally writes an attribute on mount (`el.setAttribute('<name>', …)` or `el.dataset.<key> = …`, directly in the ref body or in a `createEffect` / `onMount` directly inside it) which the element's own JSX never renders is now refused, because a ref never runs at SSR — the server HTML always lacked that attribute and hydration always added it, a visible change at the hydrate boundary. Render the attribute in JSX from props or signals so SSR already carries it, or put `/* @client */` before the ref expression to accept it appearing only after hydration; conditional writes, writes inside listeners or timers, writes to other nodes, attributes the JSX already renders, and elements with a spread are not affected.
