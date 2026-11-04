---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/perl": patch
"@barefootjs/php": patch
---

Adds the `carriesUndefined` declaration to `NativeSafeTable`: every template adapter now declares whether its runtime carries JS `undefined` apart from `null` (all `false` for now; nothing reads it yet, so compiled output is unchanged). The conformance vectors gain the `{"$undef": true}` encoding for JS `undefined` in arguments, expectations and evaluator environments, with new `undefined` cases and optional-argument twins; each runtime's harness decodes it, and the cases a runtime does not pass yet are listed in the expected-failure ledgers (including the new `eval-expected-failures.json`) or pinned as helper divergences, naming the rollout step that fixes them (spec/js-undefined-value.md).
