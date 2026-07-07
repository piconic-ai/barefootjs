---
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/jinja": patch
"@barefootjs/blade": patch
"@barefootjs/rust": patch
---

Declare two build-time refusal contracts in every template adapter's conformance-pins set, surfaced by the Priority-12 edge-case conformance sweep: `dangerouslySetInnerHTML` (raw-HTML output needs a deliberate per-template-language affordance; the compiler already refuses the shape with BF101) and `String.prototype.replaceAll` (only first-occurrence `.replace` is wired to the runtime helpers; already refused with BF101 rather than silently reusing the first-only lowering). Test-contract metadata only — no adapter runtime or codegen behavior changes; the pins make the pre-existing refusals part of each adapter's asserted conformance surface (and visible to `bf compat`).
