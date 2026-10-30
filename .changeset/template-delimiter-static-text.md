---
"@barefootjs/jsx": patch
"@barefootjs/blade": patch
"@barefootjs/go-template": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/twig": patch
"@barefootjs/pebble": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
---

Static content that spells a template engine's own tag syntax now renders as written. JSX text such as `&#123;&#123; 1 &#125;&#125;` decodes to `{{ 1 }}`, which Hono prints but the engines compiled as a tag: Blade printed `1`, and Twig, Jinja, MiniJinja, Pebble and Go `html/template` failed to render. Each `{` in static text or a literal attribute value that would open a tag on the engine (`{{`, `{%`, `{#`, Blade's `{!!`, or a `{` right before a dynamic expression) is now printed through an output tag for the brace itself. On Go, a literal attribute value holding such a brace is emitted whole through `bf_attr`, so html/template does not escape it by the attribute's context; a brace in a template-literal URL, handler or style attribute, or in `<style>` text, is still escaped by context (registered as the `brace-delimiter-in-contextual-escape` limitation). On Blade, a string literal is also spelled so that `{{`, `{!!`, `}}`, `!!}` or a directive-shaped `@` inside it is not compiled (`{a + '{{ 1 }}'}` printed `<?php echo e(1); ?>`). On Mojolicious and Xslate, a literal attribute value that spans lines no longer puts a line-statement sigil (`%`, `:`) at the start of a template line. `escapeBraceDelimiters` is exported from `@barefootjs/jsx` for adapters.
