---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

Re-point stale closed-issue citations in `conformancePins` (#3030): the module-scope-helper-call refusal family's `unescapable`/`issue` fields formerly cited closed #2994/#3012 (and Go's closed #2266) now cite #3032, the issue tracking the still-missing corpus escape twin; Pebble's `module-const-loop-source-computed` pin now cites the open #2321 instead of closed #2946, matching every sibling adapter's pin for the identical fixture. Doc-only — no behavior change.
