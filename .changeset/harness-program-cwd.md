---
"@barefootjs/jsx": patch
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

`createProgramForFile` takes an optional third argument, `{ currentDirectory }`, which sets the directory a relative `filePath` resolves against and the Program's `getCurrentDirectory()`. When it is omitted, behaviour is unchanged. The `test-render` harnesses use it through `@barefootjs/adapter-tests`' `compileFixtureJSX`. Before this change, whether a fixture's `@barefootjs/*` imports resolved to real types or to `any` depended on the directory the tests were started from. The fixture filenames, and so the file-scope ids derived from them, are unchanged.
