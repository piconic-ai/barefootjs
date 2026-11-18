---
"@barefootjs/jsx": patch
---

Client JS: a child component inside an inner `.map()` of the forwarded children of a signal-array row whose root is a component (`rows().map((o) => <Chip>{o.tags.map((t) => <li><Btn onPick={...} /></li>)}</Chip>)`) is now initialised, once per inner row, in both hydrated and client-built rows. Its handler prop was never attached, so clicking it did nothing.

Inner-loop child components now resolve their props and children against every enclosing loop row, not only the immediate parent, so a handler two inner loops deep that reads the outermost row's item no longer sees `undefined`.
