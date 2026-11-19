---
"@barefootjs/jsx": patch
---

The client template of a loop row now keeps a `{...props}` or `{...rest}` spread on the row's element. The component's init applied the caller's props only to elements outside rows, so a row built on the client (a client-only mount, or a row added after hydration) lacked the keys the server render has.
