---
"@barefootjs/shared": patch
"@barefootjs/client": patch
---

Handle `dangerouslySetInnerHTML` arriving through a spread/rest object in the runtime spread helpers (follow-up to the explicit-attribute support in #1704). `classifyDOMProp` now classifies it as a dedicated `innerHTML` kind; `spreadAttrs` skips it (so a spread carrying it no longer serialises a bogus `dangerouslySetInnerHTML="[object Object]"` attribute), and `applyRestAttrs` assigns the raw `el.innerHTML = value.__html` (the escape hatch) instead of `setAttribute`.
