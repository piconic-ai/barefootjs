---
"@barefootjs/jsx": patch
"@barefootjs/client": patch
---

A fragment-rooted component now renders the same scope shape on a client mount (no SSR markup) as SSR and hydration produce. A stateless fragment-rooted child registered without an init (a `.map()` row's `<Tag>` returning `<>…</>`) now declares `comment` / `fragmentRoot` like any other fragment root, so it is scoped with a comment pair instead of getting `bf-s` stamped on its element. An element whose `ref` callback is the recognized SSR-portal pattern (`createPortal(el, document.body, { ownerScope })`) now gets the component's own `bf-po` owner marker right after its callback runs, matching the marker SSR renders at the portal outlet, which the callback's `el.closest('[bf-s]')` cannot find under a fragment root. `createPortal` also moves such an element after the component once a top-level node of a fragment root connects, instead of leaving it before the component. A row component whose fragment root nests another fragment (`<><><li/></></>`) now carries `data-key` on its first element at SSR, as the client already did.
