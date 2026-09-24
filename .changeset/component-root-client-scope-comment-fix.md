---
"@barefootjs/jsx": patch
"@barefootjs/hono": patch
"@barefootjs/blade": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/rust": patch
"@barefootjs/mojolicious": patch
"@barefootjs/pebble": patch
"@barefootjs/twig": patch
"@barefootjs/xslate": patch
"@barefootjs/go-template": patch
---

A client-interactive component whose entire JSX return is a single child-component call (no wrapping element) now renders the parent's `<!--bf-scope:...-->` / `<!--bf-/scope:...-->` comment marker pair on every adapter, so the parent hydrates and its forwarded handlers and reactive props reach the child. The decision (`IRComponent.needsScopeComment`) is now computed once in `@barefootjs/jsx`, right after client-JS analysis runs, instead of being re-derived per adapter: Hono reads it instead of its own local check, the eight DSL adapters gained the wrap they never had, and go-template's existing partial support now also emits the closing marker (previously missing, which could leak sibling content into the scope's query range).
