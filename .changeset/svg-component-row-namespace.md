---
"@barefootjs/client": patch
---

A component with an SVG root (`<g>`, `<circle>`, …) that a loop inside `<svg>` creates after mount is now created in the SVG namespace, like the rows present at the first render. `createComponent` parses the component's template in the namespace of the element it is mounted into (the placeholder's parent, or the loop container). This made the registry `<Flow>`'s edges invisible under the CSR adapter. Rows inside an SVG `<foreignObject>` are still parsed as HTML.
