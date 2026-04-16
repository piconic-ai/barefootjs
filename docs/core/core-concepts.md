---
title: Core Concepts
description: The four design principles and a technical overview of how BarefootJS works
---

# Core Concepts

## [Backend Freedom](./core-concepts/backend-freedom.md)

The same JSX source produces templates for Hono, Go `html/template`, and any future adapter. Your component library works across stacks. No Node.js lock-in — use the server language your team already knows.

## [MPA-style Development](./core-concepts/mpa-style.md)

Add interactive UI to existing server-rendered apps without adopting a full SPA framework. Each page is a normal route; client JavaScript is only loaded where you mark it.

## [Fine-grained Reactivity](./core-concepts/reactivity.md)

Signals track dependencies at the expression level. When state changes, only the affected DOM nodes update — no virtual DOM diffing, no component-tree re-render.

## [AI-native Development](./core-concepts/ai-native.md)

The compiler produces an IR that can be tested without a browser, enabling fast component tests via `renderToTest()`. Combined with a CLI for component discovery (`barefoot search`, `barefoot ui`), AI agents can autonomously scaffold, test, and iterate on UI components.

## [How It Works](./core-concepts/how-it-works.md)

Two-phase compilation, hydration markers, and clean overrides — a technical overview of the implementation.
