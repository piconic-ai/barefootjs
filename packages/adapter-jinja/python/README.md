# barefootjs

Python runtime for [BarefootJS](https://barefootjs.dev/) marked templates, targeting [Jinja2](https://jinja.palletsprojects.com/).

[BarefootJS](https://github.com/piconic-ai/barefootjs) is a fine-grained reactive TSX compiler: you write components in TSX, and the compiler emits templates for your backend's template engine plus the client-side JS that hydrates them. This package is the server half for Python — it renders the `.jinja` templates produced by the `@barefootjs/jinja` adapter.

## Installation

```sh
pip install barefootjs
```

The only dependency is `jinja2`; everything else is stdlib.

## Quick start

Generated `.jinja` templates call the `BarefootJS` instance as a `bf` object (`{{ bf.scope_attr() }}`, `{{ bf.json(x) }}`, `{{ bf.spread_attrs(bag) }}`):

```python
from barefootjs import BarefootJS, JinjaBackend

backend = JinjaBackend(paths=["templates"])
bf = BarefootJS(None, {"backend": backend})
html = backend.render_named("counter", bf, {"count": 0})
```

## Package layout

| Module | Role |
|--------|------|
| `runtime.py` | the engine-agnostic `bf` object |
| `evaluator.py` | ParsedExpr evaluator for the `*_eval` helpers |
| `search_params.py` | `searchParams()` SSR reader |
| `backend_jinja.py` | the Jinja2 engine backend |

## Documentation

- [barefootjs.dev](https://barefootjs.dev/) — core documentation
- [GitHub: piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) — monorepo (this package lives at `packages/adapter-jinja/python`)

## License

MIT
