---
"@barefootjs/jsx": patch
---

A named JSX prop read inside a loop row (`{props.footer}`, a destructured or renamed `{footer}`, or a const alias of either) no longer renders `[object Object]` in the client. On hydration the row kept the server-rendered element and wrote `[object Object]` in front of it; a client-rendered row showed only `[object Object]`. Phase 1 now marks a row's read of the component's own prop (`IRExpression.loopRowPropRead`), and the client claims that row slot as markup, writes it through `escapeTextOrNode` and splices it in the template with `escapeTextOrMarkup`, as it already does for the same read outside a loop. Other row text, including the row item and a row param that shadows a prop name, stays escaped text (#3746).
