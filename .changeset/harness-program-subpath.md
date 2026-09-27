---
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/go-template": patch
"@barefootjs/hono": patch
"@barefootjs/jinja": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
---

The `test-render` harnesses now import `compileFixtureJSX` from the narrow `@barefootjs/adapter-tests/harness-program` subpath instead of the package barrel. This removes a module cycle between each adapter's `test-render` and `@barefootjs/adapter-tests`, and stops every `test-render` from loading the full fixture corpus.
