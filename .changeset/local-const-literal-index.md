---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Template adapters resolve a component-local array or record literal const read with a literal key (`QS[0]`, `QS.length`, `REC.k`, `REC['k']`) the same way as a module const, instead of rendering it empty. Which declaration a name reaches is now one shared decision (`resolveStaticConstBinding`): a component-local `const` hides the module const of the same name, and a const the component changes during render is not resolved.
