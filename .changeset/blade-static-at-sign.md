---
"@barefootjs/blade": patch
---

A literal `@` in static text or a literal attribute value now renders as written on Blade. Blade's compiler read it as template syntax: `x@{y}` printed the following expression's own marker echo (`{!! $bf->text_start("s1") !!}`) as source, and directive-shaped text such as `@php … @endphp`, `@verbatim` or `@@if` was compiled instead of printed. Each `@` in static template text is now emitted as a `{{ '@' }}` echo, so the rendered HTML matches Hono.
