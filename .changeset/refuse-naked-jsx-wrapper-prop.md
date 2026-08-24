---
"@barefootjs/jsx": patch
---

Fix #2667: a ternary or array literal WRAPPING JSX at a non-`children` component prop position (`header={cond ? <a/> : <b/>}`, `header={[<a/>, <b/>]}`) used to fall through the `jsx-children` classifier (which only recognizes JSX given DIRECTLY as the initializer) into the plain `expression` AttrValue path, which spliced the initializer's raw JSX SOURCE TEXT into the emitted client JS — invalid at runtime, a silent divergence discovered by the #2651 door inventory. This shape now refuses loudly at compile time with BF021, recommending the sound escape (move the conditional/array out of the prop and into the component's children) — the fragment-wrap escape this diagnostic might otherwise suggest is a known, separately-tracked unsound shape (a conditional-in-fragment reaches the child's `initChild` prop getter unbranded, corrupting the DOM on the child's first reactive read) and is deliberately not recommended.
