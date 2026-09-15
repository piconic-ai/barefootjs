---
"@barefootjs/erb": patch
"@barefootjs/mojolicious": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/blade": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

Refuse a bare-name call to a module-scope helper (a `const` arrow or `function` declaration, or any other unregistered JS-only callee) in template position with a loud `BF101` diagnostic, instead of silently emitting broken template output. Previously this shape compiled clean and either rendered the slot empty and dropped every argument (ERB, Jinja, minijinja, Twig, Blade, Text::Xslate) or crashed template execution at render time (Go `html/template`, Mojolicious under Perl `strict`) — a real JS runtime (Hono SSR, CSR) is required to execute an arbitrary JS function reference, and none of these eight non-JS "Marked Template" adapters have one.
