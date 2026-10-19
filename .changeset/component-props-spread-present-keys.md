---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/erb": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/pebble": patch
"@barefootjs/rust": patch
---

A `{...props}` spread onto a child component now merges like a JS object spread on every template adapter. A param the caller omits no longer erases an earlier explicit prop of the same key (`<Tag size="s" {...props} />` keeps `size="s"`), and the Go template adapter passes the spread to the child instead of dropping it, including a closed `{...rest}` spread. The shared plan (`planComponentProps`) decides which keys the spread carries (`propsSpreadParam`). A backend reads an explicit `undefined`/`null` prop the same as an omitted one, so that prop keeps the earlier value. When the Go constructor can't merge a call soundly, for example because the call also spreads an object whose keys are only known at render time, the build fails with BF101.
