---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

Fixed a JSX element passed at a non-`children` component prop position (e.g. `<Card header={<strong>Title</strong>}>`) rendering as HTML-escaped text on the client (`&lt;strong&gt;`) instead of the intended markup. The compiler now carries the assembled HTML through a runtime-checked brand from every producer emission (`renderChild` / `initChild` props) to the two consuming escape functions, so the receiving component's claim-plan `'markup'` slot renders it raw at both initial paint and reactive re-render, matching server-rendered output. Plain string props, and JSX passed via the `children` position, are unaffected.
