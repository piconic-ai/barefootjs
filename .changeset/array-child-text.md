---
"@barefootjs/client": patch
---

An array in child position now prints its items one after another on the client, as JSX and the server render do (`{['hello', '!']}` is `hello!`); a nullish or boolean item prints nothing. The client used to print `String(array)`, so the items were joined with commas. It showed when a component read a list of children into state and rendered it (`<Note>{label}!</Note>` with `createSignal(props.children)` printed `hello,!` after hydration or a client mount), and for a signal holding an array.
