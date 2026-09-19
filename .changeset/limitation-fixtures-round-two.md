---
"@barefootjs/go-template": patch
---

Register two more go-template limitations in the known-limitation registry, each with a reproducing conformance fixture: `client-only-loop-in-static-loop` (a `/* @client */` nested `.map()` inside a static outer loop row is refused with BF101; escape twins provided) and `loop-row-rest-bag-prop-override` (a per-row prop routed into a child's rest bag inside a composite loop row is silently dropped; declared as a render divergence).
