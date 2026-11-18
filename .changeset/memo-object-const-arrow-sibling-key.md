---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

A memo that reads a plain key of an object const (`createMemo(() => H.safe)` with `const H = { safe: 'ok', get: () => … }`) now renders that key on the template adapters. An arrow-valued member no longer makes the whole const opaque to the SSR seed, so the memo rendered empty on Mojolicious, Xslate, Jinja, ERB, Pebble, Rust, Blade and Twig for a component-local const. The seed never evaluates the member's body: a read or call of the function member itself, or the object read whole, still has no static value. Go template did not resolve a memo over a module-level object const at all (`M: nil`, an empty render), arrow member or not; it now projects the key like it does for a component-level one.
