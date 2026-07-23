---
"@barefootjs/jsx": patch
---

Lower `.map()` callbacks with an if-chain of JSX returns to a per-item conditional.

A list-render callback with a statement-block body that returns JSX from multiple branches —

```tsx
blocks().map((block, i) => {
  if (block.kind === 'code') return <pre key={i}>{block.text}</pre>
  if (block.kind === 'quote') return <blockquote key={i}>{block.text}</blockquote>
  return <p key={i}>{block.text}</p>
})
```

— now compiles and runs: the if / else-if / else (or `switch`) chain is lowered into a nested `IRConditional`, the same representation a ternary map body produces, reusing the analyzer's `extractMultiReturnJsxBranches` (already used to inline multi-return JSX helpers) plus a shared `foldMultiReturnBranches` fold. Previously the compiler kept only the single top-level `return` as the per-item template and swept the other `if (...) return <JSX/>` branches into the loop preamble as raw text, leaking JSX into the client bundle (`Unexpected token '<'` at hydrate) with the build still reporting success.

The new `BF026` (`UNSUPPORTED_LIST_CALLBACK_BODY`) diagnostic now fires only for the residual shapes the chain extractor cannot lower — a branching JSX return mixed with a local `const`/`let`, or nested control flow inside a branch — turning what remains of the silent mis-lowering into a loud, actionable compile error (code frame + rewrite guidance) with a benign placeholder so the erroring output never carries raw JSX. Supported single-expression / ternary / logical callback forms, JSX call arguments (`createPortal(<div/>, …)`), and single-return blocks with a non-JSX preamble are unaffected.
