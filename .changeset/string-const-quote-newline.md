---
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/twig": patch
"@barefootjs/pebble": patch
---

String constants and string literals holding a newline or a quote now render as Hono does. Mojolicious and Xslate wrote a string value with a newline as a single-quoted literal holding a raw newline, which ends a `%` / `:` line, so a const array loop source (`['q1\nq2', 'w'].map(...)`) or a comparison against `'a\nb'` broke the template; such a value is now written double-quoted with escapes. A JSX string attribute passed to a child component (`<Child text="it's" />`) was written into the child-prop hash unescaped and broke the template on both adapters. Twig and Pebble left an attribute built only from constants (a module string const, or a ternary of string literals such as `data-a={on ? 'a"b' : 'c'}`) unescaped, because their autoescapers skip constant expressions, so a `"` ended the attribute; it is now HTML-escaped like a dynamic value.
