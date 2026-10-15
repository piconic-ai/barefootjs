---
'@barefootjs/jinja': patch
'@barefootjs/rust': patch
'@barefootjs/pebble': patch
'@barefootjs/twig': patch
'@barefootjs/blade': patch
'@barefootjs/xslate': patch
'@barefootjs/mojolicious': patch
---

A nested loop over an enclosing loop's param (`groups.map((entries) => entries.map(…))`) no longer fails with BF101 when a computed component-scope const has the same name (`const entries = Object.keys(labels)`). The loop iterates the row's value, as on ERB.
