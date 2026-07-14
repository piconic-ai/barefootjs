---
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Fix #2266: `Slot`'s `asChild` pattern with a plain-text child (`<Button asChild>Submit</Button>`) no longer hard-errors on Go or diverges on Mojolicious.

Both adapters previously lowered the framework's `isValidElement(x)` predicate as bare truthiness on `x`. A passed-through JSX child is represented as pre-rendered markup on both SSR models, so a non-empty plain-text child was truthy and wrongly took `Slot`'s element-merge branch (`children.tag`/`children.props`) — Go hard-erred dereferencing `.Props` on a string (`can't evaluate field Props in type interface {}`); Mojolicious had no `isValidElement` primitive mapping at all and died on an undeclared `$isValidElement` stash lookup under `use strict`.

- Go: new `bf_is_element` runtime helper (`IsValidElement`, `bf.go`) does a real reflect-based shape check (a map/struct carrying both `tag`+`props`, case-insensitively) — mirrors JS's `'tag' in x && 'props' in x`. `isValidElement(x)`'s lowering now calls it instead of a bare truthiness check.
- Mojolicious: new `is_element` method on the shared `adapter-perl` runtime (`BarefootJS.pm`, also used by Xslate), and a new `isValidElement` → `bf->is_element(...)` entry in `MOJO_TEMPLATE_PRIMITIVES`.

ERB/Jinja/Rust/Twig/Blade/Xslate already passed this fixture's data points and are unaffected.

Removes the `button:gen:asChild:true` / `kbd:gen:asChild:true` `skipDataPoints` pins on Go and Mojolicious.
