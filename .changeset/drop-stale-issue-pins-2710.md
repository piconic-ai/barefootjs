---
"@barefootjs/hono": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
---

Drop the `issue:` citation on the `jsx-element-prop-ternary` / `jsx-element-prop-array` (BF021) and `namespace-import-primitive` (BF013) conformance pins. Both refusals were tracked by #2667 and #2771, which are now closed — the loud refusal is confirmed to be the permanent, intended behavior for both (not a tracked capability gap), so the stale closed-issue links no longer serve a purpose. No behavior change; comment/metadata only.
