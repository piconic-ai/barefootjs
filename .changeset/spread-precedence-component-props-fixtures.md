---
"@barefootjs/go-template": patch
---

Pin the go-template render divergence for an open rest spread onto a child component (`component-open-rest-key-override`) under the existing `open-rest-spread-onto-child-component` limitation. No generated output changes; the new conformance fixtures guard that component-prop spreads keep "last write wins, once" and that a lowercase `crossorigin` literal beside an open bag is kept.
