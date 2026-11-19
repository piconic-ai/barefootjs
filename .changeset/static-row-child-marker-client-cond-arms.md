---
"@barefootjs/jsx": patch
---

A child component imported from another file and rendered inside a static array row (`rows.map(r => <li><Badge n={n()} /></li>)`) is now named by an `@bf-child` import marker, so the bundler includes the child's client JS and the child follows a signal passed as a prop. The marker was only emitted for loops reconciled as composite elements.

The arms of a `/* @client */` conditional are now emitted inside the `<!--bf-cond-start-->` / `<!--bf-cond-end-->` marker pair the server renders for it, instead of as `bf-c` elements that the server never emitted. Before, a `/* @client */` conditional with single-element arms mounted nothing after hydration, outside a loop as well as inside a static array row. A conditional that is not `/* @client */` is unchanged.
