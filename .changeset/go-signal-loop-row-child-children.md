---
"@barefootjs/go-template": patch
---

A loop over a signal array whose row is a child component with forwarded JSX children (`rows().map((o) => <Chip key={o.id}><b>{o.id}</b></Chip>)`) now renders its rows at SSR. The constructor builds the rows from the signal's initial value (a literal, an array prop, a member of an object prop such as `initial.items`, or scalar values) and the wrapper carries the row's fields, where the loop used to render empty. A seed whose rows have no Go type the wrapper can carry (a computed `on ? items : []`) still builds no rows. A loop row whose forwarded children are static text or elements (`<Chip key={o.id}>fixed</Chip>`) now renders those children instead of dropping them, on a signal array and on a module-const array.
