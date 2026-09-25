---
"@barefootjs/jsx": patch
---

A component prop whose name merely starts with `on` (`only`, `once`, `online`) is no longer treated as an event handler. The compiler now classifies a prop as a handler only when `on` is followed by an uppercase letter (`onClick`), the same rule it already used for element attributes, so such a prop is passed and updated as a normal prop in the client JS. The rule is exported as `isEventHandlerName` for adapters to share.
