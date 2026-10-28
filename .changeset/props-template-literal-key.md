---
"@barefootjs/jsx": patch
---

A no-substitution template-literal key on the props object (``props[`title`]``) now reads the prop on every template adapter, the same as `props['title']`. It previously rendered empty on Blade, ERB, Jinja, MiniJinja, Pebble, Twig and Xslate, and failed to render on Mojolicious and Go `html/template`.
