---
"@barefootjs/client": patch
---

A fragment-rooted child component (`<><span>{children}</span></>`) keeps the children and handlers a loop row forwards through it.

- A handler on an element forwarded through a fragment-rooted child nested in a loop row (`{rows().map(o => <Chip key={o.id}><Chip><button onClick={…} /></Chip></Chip>)}`) is wired, on hydrated and client-built rows. It was never attached.
- A client-built row whose fragment-rooted component receives another component as `children` renders those children. The outer component rendered empty.
- A child mounted by a client-built row inside a fragment-rooted component is scoped under that component (`${host}_${slot}`), as SSR scopes it, rather than under a random id.
