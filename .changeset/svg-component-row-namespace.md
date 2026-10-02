---
"@barefootjs/client": patch
---

A component with an SVG root (`<g>`, `<circle>`, …) that a loop inside `<svg>` creates after mount is now created in the SVG namespace, like the rows present at the first render. `createComponent` parses the component's template in the namespace of the element it is mounted into (the placeholder's parent, or the loop container). This made the registry `<Flow>`'s edges invisible under the CSR adapter. Children of an HTML integration point, such as SVG `<foreignObject>`, `<desc>` and `<title>` or MathML `<mi>`/`<mo>`/`<mn>`/`<ms>`/`<mtext>`, are still parsed as HTML.
