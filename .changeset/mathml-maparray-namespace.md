---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

MathML-rooted `mapArray` / conditional-branch bodies now clone in the MathML namespace, porting the existing SVG synthetic-wrap fix (`<math>...</math>` instead of `<svg>...</svg>`) to MathML root tags (`mrow`, `mfrac`, `msup`, `msub`, `mn`, `mi`, `mtable`, ...). Previously a `.map()` or ternary body rooted at a MathML tag cloned as an `HTMLUnknownElement` in the xhtml namespace and rendered nothing. The runtime's `parseHTML` gained the matching MathML wrap for dynamically-inserted markup whose parent lives in the MathML namespace.
