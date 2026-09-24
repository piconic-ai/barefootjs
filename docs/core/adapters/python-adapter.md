---
title: Python Adapter
description: Render BarefootJS components from Python via Jinja2 — no framework required (Flask, Django, FastAPI, bare WSGI).
---

# Python Adapter

`@barefootjs/jinja` compiles components to Jinja2 templates (`.jinja`) rendered by a small Python package (`barefootjs`) over a plain `jinja2.Environment`. Flask, Django, FastAPI or bare WSGI all work the same way.

## Install

```sh
npm install @barefootjs/jinja
```

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/jinja/vite'

export default defineConfig({
  plugins: barefoot({ components: ['components'], templates: 'dist/templates' }),
})
```

## Render from your server

Vendor `python/barefootjs/` from the npm package into your app; its only dependency is `jinja2`.

```python
from barefootjs import BarefootJS
from barefootjs.backend_jinja import JinjaBackend

backend = JinjaBackend(
    paths=["dist/templates"],
    environment_options={"trim_blocks": True, "lstrip_blocks": True},
)

bf = BarefootJS(None, {"backend": backend})
bf._scope_id("Counter_0")
body = backend.render_named("counter", bf, {"initial": 0})
html = f"<!doctype html><body>{body}{bf.scripts()}</body>"
```

The templates assume four `Environment` settings. `JinjaBackend` applies the first two by default; pass the other two in `environment_options`, or set all four when you hand it a pre-built `Environment` via `env=`:

| Setting | Why |
|---------|-----|
| `autoescape=True` | Templates rely on engine escaping; helpers that emit markup return `Markup`. |
| `undefined=ChainableUndefined` | A missing nested attribute (`missing.deep`) renders empty instead of raising. |
| `trim_blocks=True` | `{% … %}` tags sit on their own source line; without this every tag leaks a newline into the HTML. |
| `lstrip_blocks=True` | Same for the indentation before each tag. |

## Notes

- Template names are the snake_cased component name: `UserCard` → `user_card.jinja`.
- `render_named` mangles prop names that collide with Jinja/Python reserved words, so a prop named `class` or `none` still works.
- Interpolations and conditions route through `bf.string(...)` / `bf.truthy(...)` so the template follows JS truthiness and stringification, not Python's.
- In development pass `"auto_reload": True, "cache_size": 0` in `environment_options` so rebuilt templates render on the next request.

Examples: [`integrations/flask`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/flask), [`integrations/fastapi`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/fastapi) and [`integrations/django`](https://github.com/piconic-ai/barefootjs/tree/main/integrations/django).
