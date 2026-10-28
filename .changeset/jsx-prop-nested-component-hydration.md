---
"@barefootjs/client": patch
---

A named JSX prop whose element holds a component (`header={<span><Badge /></span>}`) no longer turns into escaped HTML text on hydration. The `__slot()` marker the compiler passes for it now reaches the slot writer intact through `escapeTextOrNode` and `textOrNode`, so the server-rendered element and its hydrated component stay in place, and the template splices (`escapeTextOrMarkup`, `__bfSlot`) render the marker's markup raw, as they do a `bfMarkup()` value (#3699).
