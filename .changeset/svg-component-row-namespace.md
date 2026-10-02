---
"@barefootjs/client": patch
---

A component with an SVG root (`<g>`, `<circle>`, …) that a loop inside `<svg>` creates after mount is now created in the SVG namespace, like the rows present at the first render. `createComponent` parses the component's template in the namespace of the element it is mounted into (the placeholder's parent, or the loop container). This made the registry `<Flow>`'s edges invisible under the CSR adapter. Dynamic markup under SVG `<foreignObject>`, `<desc>` and `<title>` (and `<annotation-xml>` with an HTML encoding) is parsed as HTML. Under MathML `<mi>`/`<mo>`/`<mn>`/`<ms>`/`<mtext>` it is parsed as HTML except `<mglyph>`/`<malignmark>`, matching the browser's own parser.
