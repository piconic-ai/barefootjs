---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

The client-side render of a keyed `.map()` row puts the row's `data-key` where the server render does. When the row's component renders its first element from somewhere else (it returns another component, `return <Kid />`; a fragment or a branch starts with one; or it renders only the caller's children, `<>{props.children}</>`), `renderChild` used to add `data-key` to that element, which the server render leaves unkeyed, and a fragment that starts with a component and then renders an element of its own got the key on the wrong element. Such a component's template now takes the key and renders it on its own keyed elements (`keyRelay: true` on its `hydrate()` def). A mounted row still carries its key on its first element, where `mapArray` reads it.
